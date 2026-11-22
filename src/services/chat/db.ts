import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { toSessionSummary, type Session, type SessionSummary } from './types.js'

/** IndexedDB 存储结构版本；新增或调整存储、索引时递增。 */
const DB_VERSION = 11

/** 文件原件按附件的本地 id 存储，所有引用同一 id 的消息共用一份；用于缩略图、打开查看，以及没有 serverId 时补传。 */
export type StoredFile = {
  id: string
  blob: Blob
}

/**
 * 浏览器写不进 Blob 时的替代格式：原件按 base64 存成普通字符串。
 * 部分手机浏览器与 WebKit 内核把 Blob 写进 IndexedDB 会直接抛
 * `UnknownError: Error preparing Blob/File data to be stored in object store`，
 * 同一个存储写普通字符串却正常，所以退一步也要把图片留下来（体积约 +33%）。
 */
type StoredFileData = { id: string; type: string; data: string }
type StoredFileRecord = StoredFile | StoredFileData

/** 文件引用留在摘要中，删除会话时通过索引判断原件是否仍被引用。 */
type StoredSessionSummary = SessionSummary & { fileIds: string[] }

interface ChatDB extends DBSchema {
  /** 当前使用的会话，界面读写都在这里 */
  sessions: { key: string; value: Session }
  sessionSummaries: {
    key: string
    value: StoredSessionSummary
    indexes: { fileIds: string }
  }
  /** 当前使用的文件原件 */
  files: { key: string; value: StoredFileRecord }
  /**
   * 历史导入的暂存：导入过程中会话与原件只写入这两个存储，`sessions` / `files` 保持不变；
   * 全部校验通过后在一个事务中替换正式数据并清空暂存，失败时只清空暂存。
   */
  sessionsStaging: { key: string; value: Session }
  filesStaging: { key: string; value: StoredFileRecord }
}

let dbPromise: Promise<IDBPDatabase<ChatDB>> | null = null

/** 连接被浏览器强制关闭时通知外部：此后这条连接上的事务都会失败，需要重新落盘。 */
const closeListeners = new Set<() => void>()

/** 订阅「连接被关了」。手机存储吃紧时浏览器会回收站点数据并关掉连接，界面要靠它补存一次。 */
export const onConnectionClosed = (listener: () => void): (() => void) => {
  closeListeners.add(listener)
  return () => {
    closeListeners.delete(listener)
  }
}

/** 只丢弃当前缓存的那条连接；已经换上的新连接不能被旧事件的回调清掉。 */
const forgetConnection = (promise: Promise<IDBPDatabase<ChatDB>>) => {
  if (dbPromise === promise) {
    dbPromise = null
  }
}

const connect = (): Promise<IDBPDatabase<ChatDB>> => {
  const promise = openDB<ChatDB>('chat-demo', DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, tx) {
      // 初始化当前格式需要的存储与索引，不迁移旧消息。
      for (const name of ['sessions', 'files', 'sessionsStaging', 'filesStaging'] as const) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      }
      const summaries = db.objectStoreNames.contains('sessionSummaries')
        ? tx.objectStore('sessionSummaries')
        : db.createObjectStore('sessionSummaries', { keyPath: 'id' })
      if (!summaries.indexNames.contains('fileIds')) {
        summaries.createIndex('fileIds', 'fileIds', { multiEntry: true })
      }
    },
  })
  dbPromise = promise
  void promise.then(
    (db) => {
      // 浏览器可以直接关闭连接：回收站点存储、清除站点数据、设备内存吃紧。
      // 关闭后这条连接上的一切事务都抛 InvalidStateError，必须丢掉缓存，下次操作重开。
      db.addEventListener('close', () => {
        forgetConnection(promise)
        closeListeners.forEach((listener) => listener())
      })
    },
    // 打开失败后允许界面重试，避免一直复用已拒绝的 Promise。
    () => forgetConnection(promise)
  )
  return promise
}

// 每个操作拿到连接后立即创建事务；IndexedDB 按创建顺序执行范围重叠的事务，读取总能看到之前发起的写入。
const getDB = () => dbPromise ?? connect()

/** 连接已经关了：这时候在它上面 `transaction()` 抛 InvalidStateError。 */
const isClosedConnection = (error: unknown) =>
  error instanceof DOMException && error.name === 'InvalidStateError'

/**
 * 连接被外部关闭后重开一次再执行。
 * 关连接不等于丢数据：重开后原来写入的内容还在；若存储已被清空，重开得到空库，写入照样成功，
 * 至少能把内存里这一份留住。写操作都是整体 put，重试幂等。
 */
const withDB = async <T>(run: (db: IDBPDatabase<ChatDB>) => Promise<T>): Promise<T> => {
  try {
    return await run(await getDB())
  } catch (error) {
    if (!isClosedConnection(error)) {
      throw error
    }
    dbPromise = null
    return run(await getDB())
  }
}

const storedSummary = (session: Session): StoredSessionSummary => ({
  ...toSessionSummary(session),
  fileIds: [
    ...new Set(
      session.messages.flatMap((message) =>
        message.role === 'user' ? message.files.map((file) => file.id) : []
      )
    ),
  ],
})

const abortTransaction = (tx: { abort(): void }) => {
  try {
    tx.abort()
  } catch {
    // 事务已因请求失败中止。
  }
}

/** 浏览器拒绝把 Blob 写进 IndexedDB：引擎不支持，或存储写不进去，两种都是这条错。 */
export const isBlobStorageError = (error: unknown): boolean =>
  error instanceof DOMException &&
  error.name === 'UnknownError' &&
  error.message.includes('Blob/File data')

/**
 * 存储配额已满：再写就不接受了，重试也没用，只能腾地方。
 * 这与「连接被关」「Blob 写不进去」不是一回事——那些重开连接或换 base64 还能救。
 */
export const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')

const BASE64_CHUNK = 0x8000

const toBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK))
  }
  return btoa(binary)
}

const fromBase64 = (record: StoredFileData): Blob => {
  const binary = atob(record.data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: record.type })
}

/** 探测记录的 id，写完立刻删；导入开始时也会整体清空暂存。 */
const BLOB_PROBE_ID = '__blob_probe__'

let blobSupport: Promise<boolean> | null = null

const probeBlobSupport = async (): Promise<boolean> => {
  try {
    await withDB(async (db) => {
      const tx = db.transaction('filesStaging', 'readwrite')
      await Promise.all([
        tx.store.put({ id: BLOB_PROBE_ID, blob: new Blob([new Uint8Array(8)]) }),
        tx.done,
      ])
    })
  } catch (error) {
    reportStorageError('probe blob storage')(error)
    return false
  }
  try {
    await withDB(async (db) => {
      const tx = db.transaction('filesStaging', 'readwrite')
      await Promise.all([tx.store.delete(BLOB_PROBE_ID), tx.done])
    })
  } catch {
    // 删不掉也不要紧：下次导入开始时会清空暂存。
  }
  return true
}

/** 本机能不能把 Blob 写进 IndexedDB；不能时原件改存 base64。结论按页面会话缓存一次。 */
const canStoreBlobs = (): Promise<boolean> => (blobSupport ??= probeBlobSupport())

/** 写入存储用的记录：能写 Blob 就直接写，写不进去才退成 base64 字符串。 */
const fileRecords = async (files: StoredFile[]): Promise<StoredFileRecord[]> => {
  if (files.length === 0 || (await canStoreBlobs())) {
    return files
  }
  return Promise.all(
    files.map(async (file) => ({
      id: file.id,
      type: file.blob.type,
      data: await toBase64(file.blob),
    }))
  )
}

/** 遇到「写不进 Blob」时改存 base64 再试一次；探测称能写但单张失败（超限、空间刚满）也走这里。 */
const retryAsBase64 = async <T>(
  error: unknown,
  records: StoredFileRecord[],
  original: StoredFile[],
  write: (records: StoredFileRecord[]) => Promise<T>
): Promise<T> => {
  if (records !== original || !isBlobStorageError(error)) {
    throw error
  }
  blobSupport = Promise.resolve(false)
  return write(await fileRecords(original))
}

export const loadSessionSummaries = async (): Promise<SessionSummary[]> =>
  (await withDB((db) => db.getAll('sessionSummaries'))).map(toSessionSummary)

export const loadSession = (id: string): Promise<Session | undefined> =>
  withDB((db) => db.get('sessions', id))

export const saveSession = async (session: Session, files: StoredFile[] = []): Promise<void> => {
  const summary = storedSummary(session)
  const write = (records: StoredFileRecord[]) =>
    withDB(async (db) => {
      const tx = db.transaction(['sessions', 'sessionSummaries', 'files'], 'readwrite')
      await Promise.all([
        (async () => {
          try {
            for (const record of records) {
              await tx.objectStore('files').put(record)
            }
            await tx.objectStore('sessions').put(session)
            await tx.objectStore('sessionSummaries').put(summary)
          } catch (error) {
            abortTransaction(tx)
            throw error
          }
        })(),
        tx.done,
      ])
    })
  const records = await fileRecords(files)
  try {
    await write(records)
  } catch (error) {
    await retryAsBase64(error, records, files, write)
  }
}

/** 未打开的会话也可重命名，只读取该会话，原子更新详情和列表。 */
export const renameSession = (id: string, title: string): Promise<void> =>
  withDB(async (db) => {
    const tx = db.transaction(['sessions', 'sessionSummaries'], 'readwrite')
    await Promise.all([
      (async () => {
        try {
          const sessions = tx.objectStore('sessions')
          const session = await sessions.get(id)
          if (session) {
            session.title = title
            await sessions.put(session)
            await tx.objectStore('sessionSummaries').put(storedSummary(session))
          }
        } catch (error) {
          abortTransaction(tx)
          throw error
        }
      })(),
      tx.done,
    ])
  })

/** 未打开的会话也可置顶，只读取该会话，原子更新详情和列表；不改 updated_at。 */
export const pinSession = (id: string, pinned: boolean): Promise<void> =>
  withDB(async (db) => {
    const tx = db.transaction(['sessions', 'sessionSummaries'], 'readwrite')
    await Promise.all([
      (async () => {
        try {
          const sessions = tx.objectStore('sessions')
          const session = await sessions.get(id)
          if (session) {
            session.pinned = pinned
            await sessions.put(session)
            await tx.objectStore('sessionSummaries').put(storedSummary(session))
          }
        } catch (error) {
          abortTransaction(tx)
          throw error
        }
      })(),
      tx.done,
    ])
  })

/** 删除会话，仅清理已无会话引用的本地原件；远端文件不删。 */
export const deleteSession = (sessionId: string): Promise<void> =>
  withDB(async (db) => {
    const tx = db.transaction(['sessions', 'sessionSummaries', 'files'], 'readwrite')
    await Promise.all([
      (async () => {
        try {
          const summaries = tx.objectStore('sessionSummaries')
          const summary = await summaries.get(sessionId)
          await tx.objectStore('sessions').delete(sessionId)
          await summaries.delete(sessionId)
          for (const id of summary?.fileIds ?? []) {
            if ((await summaries.index('fileIds').count(id)) === 0) {
              await tx.objectStore('files').delete(id)
            }
          }
        } catch (error) {
          abortTransaction(tx)
          throw error
        }
      })(),
      tx.done,
    ])
  })

const putFiles = async (store: 'files' | 'filesStaging', files: StoredFile[]): Promise<void> => {
  const write = (records: StoredFileRecord[]) =>
    withDB(async (db) => {
      const tx = db.transaction(store, 'readwrite')
      await Promise.all([...records.map((record) => tx.store.put(record)), tx.done])
    })
  const records = await fileRecords(files)
  try {
    await write(records)
  } catch (error) {
    await retryAsBase64(error, records, files, write)
  }
}

export const saveFiles = (files: StoredFile[]): Promise<void> => putFiles('files', files)

export const loadFile = async (id: string): Promise<Blob | undefined> => {
  const record = await withDB((db) => db.get('files', id))
  if (!record) {
    return undefined
  }
  return 'blob' in record ? record.blob : fromBase64(record)
}

/**
 * 本机数据的体检数字：会话数、附件条数与占用、最后一次成功写入的时间。
 * 都从库里读，而不是从内存里的会话状态读——保存失败时内存照样前进，
 * 「最后写入」必须反映真正落盘的那一次，否则它恰好在最该报警的时候看不出问题。
 */
export const loadLocalStats = async (): Promise<{
  sessions: number
  files: number
  attachmentBytes: number
  lastWrite: number
}> => {
  const [summaries, records] = await withDB((db) =>
    Promise.all([db.getAll('sessionSummaries'), db.getAll('files')])
  )
  let attachmentBytes = 0
  for (const record of records) {
    // 只读元数据：Blob 的大小与 base64 字符串长度，不解码原件
    attachmentBytes += 'blob' in record ? record.blob.size : record.data.length
  }
  let lastWrite = 0
  for (const summary of summaries) {
    lastWrite = Math.max(lastWrite, summary.updatedAt)
  }
  return { sessions: summaries.length, files: records.length, attachmentBytes, lastWrite }
}

/** 清空导入暂存：开始导入前清除上次中断（如关闭页面）遗留的数据，导入失败后清除本次写入。 */
export const clearStaging = (): Promise<void> =>
  withDB(async (db) => {
    const tx = db.transaction(['sessionsStaging', 'filesStaging'], 'readwrite')
    await Promise.all([
      tx.objectStore('sessionsStaging').clear(),
      tx.objectStore('filesStaging').clear(),
      tx.done,
    ])
  })

export const addStagingSession = (session: Session): Promise<void> =>
  withDB(async (db) => {
    await db.add('sessionsStaging', session)
  })

export const saveStagingFiles = (files: StoredFile[]): Promise<void> =>
  putFiles('filesStaging', files)

/** 图片位于会话 JSON 之后；全部读完后回填具体 MIME，保留归档给出的 isImage 标识。 */
export const updateStagingFileTypes = (types: ReadonlyMap<string, string>): Promise<void> =>
  withDB(async (db) => {
    const tx = db.transaction('sessionsStaging', 'readwrite')
    await Promise.all([
      (async () => {
        for (let cursor = await tx.store.openCursor(); cursor; cursor = await cursor.continue()) {
          const session = cursor.value
          let changed = false
          for (const message of session.messages) {
            if (message.role !== 'user') {
              continue
            }
            for (const file of message.files) {
              const type = types.get(file.id) ?? ''
              if (file.mimeType !== type) {
                file.mimeType = type
                changed = true
              }
            }
          }
          if (changed) {
            await cursor.update(session)
          }
        }
      })(),
      tx.done,
    ])
  })

/**
 * 导入完成后用暂存替换正式数据：同一事务中替换会话、摘要和原件，并清空暂存。
 * 逐条游标复制，同一时间只读取一条记录；事务失败时整体回滚，正式数据不变。
 */
export const commitStaging = (): Promise<SessionSummary[]> =>
  withDB(async (db) => {
    const summaries: SessionSummary[] = []
    const tx = db.transaction(
      ['sessions', 'sessionSummaries', 'files', 'sessionsStaging', 'filesStaging'],
      'readwrite'
    )
    const move = async (from: 'sessionsStaging' | 'filesStaging', to: 'sessions' | 'files') => {
      try {
        const target = tx.objectStore(to)
        await target.clear()
        if (to === 'sessions') {
          await tx.objectStore('sessionSummaries').clear()
        }
        for (
          let cursor = await tx.objectStore(from).openCursor();
          cursor;
          cursor = await cursor.continue()
        ) {
          await target.put(cursor.value)
          if (to === 'sessions') {
            const summary = storedSummary(cursor.value as Session)
            await tx.objectStore('sessionSummaries').put(summary)
            summaries.push(toSessionSummary(summary))
          }
          // 复制一条就删一条：大归档的会话与原件动辄上 GB，暂存与正式数据同时存在会撞上配额
          await cursor.delete()
        }
        await tx.objectStore(from).clear()
      } catch (error) {
        // 同步抛出的错误不会让事务自动回滚，需显式中止，避免只提交清空和部分移入。
        abortTransaction(tx)
        throw error
      }
    }
    await Promise.all([move('sessionsStaging', 'sessions'), move('filesStaging', 'files'), tx.done])
    // 直接返回本次提交的列表，调用方无需在替换成功后再发起可能失败的读取。
    return summaries
  })

/**
 * 尽量让浏览器把本站的存储列为「持久」：持久存储不会被磁盘紧张时的自动回收挑中。
 * 浏览器可以静默拒绝（未安装、没有足够的站点交互记录），拒绝也不影响使用。
 */
export const requestPersistentStorage = (): void => {
  const storage = (navigator as Navigator & { storage?: StorageManager }).storage
  if (typeof storage?.persist !== 'function') {
    return
  }
  void storage.persist().catch(() => {})
}

/** 本地存储失败不打断对话，只在控制台留痕 */
export const reportStorageError = (action: string) => (error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[storage] ${action} failed`, error)
}
