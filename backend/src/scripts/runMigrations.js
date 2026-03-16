require('dotenv').config();

const {
  connectMongo,
  migrateCollectionNames,
  migrateUserSensitiveFields,
  migrateTemplateSensitiveFields,
  migrateCampaignSensitiveFields,
  migrateGroupContactFields,
  migrateVariableFields,
} = require('../db');
const { assertDataSecurityConfig } = require('../utils/dataSecurity');

async function runMigrations() {
  assertDataSecurityConfig();
  await connectMongo();
  console.log('Connected to MongoDB');

  await migrateCollectionNames();
  console.log('Collection naming migration complete');

  await migrateUserSensitiveFields();
  console.log('User sensitive fields migration complete');

  await migrateTemplateSensitiveFields();
  console.log('Template sensitive fields migration complete');

  await migrateCampaignSensitiveFields();
  console.log('Campaign sensitive fields migration complete');

  await migrateGroupContactFields();
  console.log('Group contact fields migration complete');

  await migrateVariableFields();
  console.log('Variable fields migration complete');

  console.log('All migrations completed successfully');
}

runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err.message || err);
    process.exit(1);
  });
