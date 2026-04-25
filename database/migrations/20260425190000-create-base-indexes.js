const collectionsToEnsure = [
  'users',
  'companies',
  'projects',
  'tasks',
  'chats',
  'messages',
  'shifts',
];

const userIndexes = [
  [{ email: 1 }, { unique: true, name: 'email_1' }],
];

const companyIndexes = [
  [{ email: 1 }, { unique: true, name: 'email_1' }],
];

const shiftIndexes = [
  [{ workerId: 1 }, { name: 'workerId_1' }],
  [{ projectId: 1 }, { name: 'projectId_1' }],
  [{ shiftDate: 1 }, { name: 'shiftDate_1' }],
  [{ status: 1 }, { name: 'status_1' }],
  [{ workerId: 1, shiftDate: 1, status: 1 }, { name: 'workerId_1_shiftDate_1_status_1' }],
];

async function collectionExists(db, collectionName) {
  const collections = await db.listCollections({ name: collectionName }, { nameOnly: true }).toArray();
  return collections.length > 0;
}

async function ensureCollection(db, collectionName) {
  if (!(await collectionExists(db, collectionName))) {
    await db.createCollection(collectionName);
  }
}

async function createIndexes(collection, indexes) {
  for (const [keys, options] of indexes) {
    await collection.createIndex(keys, options);
  }
}

async function dropIndexes(collection, indexNames) {
  const existingIndexes = await collection.indexes();
  const existingIndexNames = new Set(existingIndexes.map((index) => index.name));

  for (const indexName of indexNames) {
    if (existingIndexNames.has(indexName)) {
      await collection.dropIndex(indexName);
    }
  }
}

module.exports = {
  async up(db) {
    for (const collectionName of collectionsToEnsure) {
      await ensureCollection(db, collectionName);
    }

    await createIndexes(db.collection('users'), userIndexes);
    await createIndexes(db.collection('companies'), companyIndexes);
    await createIndexes(db.collection('shifts'), shiftIndexes);
  },

  async down(db) {
    await dropIndexes(db.collection('users'), ['email_1']);
    await dropIndexes(db.collection('companies'), ['email_1']);
    await dropIndexes(db.collection('shifts'), [
      'workerId_1',
      'projectId_1',
      'shiftDate_1',
      'status_1',
      'workerId_1_shiftDate_1_status_1',
    ]);
  },
};
