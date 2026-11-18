import { DataSource } from 'typeorm';
import dataSource from './data-source';
import { PushSubscriptions1793750400000 } from './migrations/1793750400000-PushSubscriptions';

// Existing installations may have manually applied older schema changes.
export const pushMigrationSource = new DataSource({
  ...dataSource.options,
  migrations: [PushSubscriptions1793750400000],
});

if (require.main === module) {
  void (async () => {
    try {
      await pushMigrationSource.initialize();
      await pushMigrationSource.runMigrations({ transaction: 'all' });
      console.log('Push subscription migration complete.');
    } catch {
      console.error(
        'Push subscription migration failed. Check database access and schema.',
      );
      process.exitCode = 1;
    } finally {
      if (pushMigrationSource.isInitialized)
        await pushMigrationSource.destroy();
    }
  })();
}
