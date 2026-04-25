const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });

function getDatabaseNameFromUri(uri) {
  const match = uri.match(/\/([^/?]+)(\?|$)/);
  return match?.[1];
}

const mongodbUri = process.env.MONGODB_URI;

if (!mongodbUri) {
  throw new Error('MONGODB_URI is not set. Add it to the .env file or environment variables.');
}

const databaseName =
  process.env.MONGODB_DB_NAME ||
  getDatabaseNameFromUri(mongodbUri) ||
  'project_management';

module.exports = {
  mongodb: {
    url: mongodbUri,
    databaseName,
    options: {},
  },
  migrationsDir: 'database/migrations',
  changelogCollectionName: 'db_migrations_changelog',
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'commonjs',
};
