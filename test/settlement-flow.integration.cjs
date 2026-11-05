// Uses only a dedicated loopback MySQL fixture and the production build; no .env or external messaging.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { DataSource } = require('typeorm');
const { User } = require('../dist/users/entities/user.entity');
const { Party } = require('../dist/parties/entities/party.entity');
const { PartyMember } = require('../dist/party-members/entities/party-member.entity');
const { Settlement } = require('../dist/settlements/entities/settlement.entity');
const { SettlementItem } = require('../dist/settlements/entities/settlement-item.entity');
const { SettlementItemMember } = require('../dist/settlements/entities/settlement-item-member.entity');
const { SettlementPayment } = require('../dist/settlements/entities/settlement-payment.entity');
const { SettlementsService } = require('../dist/settlements/settlements.service');

const database = 'gachimura_settlement_check';
const host = '127.0.0.1';
const port = Number(process.env.SETTLEMENT_TEST_DB_PORT || '33366');
const privateFields = ['email', 'password', 'phoneNumber', 'birthDate', 'bankName', 'accountNumber', 'accountHolder', 'refreshToken'];
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('local concurrency barrier timed out')), 8000);
    })]);
  } finally { clearTimeout(timer); }
}
const rejectsStatus = (promise, status) => assert.rejects(promise, error => error.getStatus?.() === status);
function publicUser(value) {
  assert.ok(value, 'fixture user is present');
  for (const field of privateFields) assert.equal(Object.hasOwn(value, field), false, `${field} must stay private`);
}

async function main() {
  assert.equal(existsSync('.env') || existsSync('.env.local'), false, 'run in an isolated checkout without environment files');
  assert.equal(process.env.SETTLEMENT_TEST_DB_HOST || host, host, 'test DB must use loopback');
  assert.equal(process.env.SETTLEMENT_TEST_DB_NAME || database, database, 'only the dedicated fixture DB is allowed');
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, 'invalid test DB port');
  const source = new DataSource({
    type: 'mysql', host, port, database, username: 'fixture', password: 'fixture-only',
    entities: [User, Party, PartyMember, Settlement, SettlementItem, SettlementItemMember, SettlementPayment],
    synchronize: false, extra: { connectionLimit: 6 },
  });
  const messages = [];
  let failMessages = false;
  let warningCount = 0;
  let originalRunner;
  try {
    await source.initialize();
    assert.equal((await source.query('SELECT DATABASE() AS name'))[0].name, database);
    await source.dropDatabase();
    await source.synchronize();
    const repo = entity => source.getRepository(entity);
    const service = new SettlementsService(
      repo(Settlement), repo(SettlementItem), repo(SettlementItemMember), repo(SettlementPayment),
      repo(Party), repo(PartyMember), source,
      { sendSystemMessage: async (partyId, message) => {
        if (failMessages) throw new Error('fixture chat unavailable');
        messages.push({ partyId, message });
      } },
    );
    service.logger.warn = () => { warningCount++; };
    await repo(User).save([1, 2, 3, 4].map(id => ({
      id, email: `settlement-${id}@example.test`, nickname: `Fixture ${id}`, password: 'fixture-not-a-login',
      phoneNumber: '01000000000', birthDate: new Date('1998-01-01T00:00:00Z'),
      bankName: 'Fixture bank', accountNumber: 'FIXTURE_ONLY', accountHolder: 'Fixture holder',
    })));
    async function flow(price = 10000) {
      const party = await repo(Party).save({ hostId: 1, title: 'Settlement fixture', capacity: 3, currentCount: 3 });
      // A current host without a membership row must still be allowed to choose their own items.
      await repo(PartyMember).save([2, 3].map(userId => ({ partyId: party.id, userId, status: 'APPROVED' })));
      const created = await service.create(1, party.id);
      const updated = await service.updateItems(created.id, 1, { items: [{ name: 'Fixture item', price, quantity: 1 }] });
      const itemId = updated.items[0].id;
      await service.startSelecting(created.id, 1);
      for (const userId of [1, 2, 3]) await service.selectItems(created.id, userId, { itemIds: [itemId] });
      return { id: created.id, partyId: party.id, itemId };
    }

    const basic = await flow();
    await service.selectItems(basic.id, 2, { itemIds: [] });
    const cleared = await service.findOne(basic.id, 1);
    assert.deepEqual(cleared.items[0].members.map(value => value.userId).sort(), [1, 3]);
    await service.selectItems(basic.id, 2, { itemIds: [basic.itemId] });
    await rejectsStatus(service.findOne(basic.id, 4), 403);
    await rejectsStatus(service.getPayments(basic.id, 4), 403);
    await rejectsStatus(service.selectItems(basic.id, 4, { itemIds: [basic.itemId] }), 403);
    const publicResult = await service.findOne(basic.id, 2);
    publicUser(publicResult.host);
    for (const member of publicResult.items[0].members) publicUser(member.user);
    await service.confirm(basic.id, 1);
    let payments = (await service.getPayments(basic.id, 1)).sort((a, b) => a.userId - b.userId);
    assert.deepEqual(payments.map(value => [value.userId, value.amount, value.status]), [[2, 3333, 'PENDING'], [3, 3333, 'PENDING']]);
    assert.equal(10000 - payments.reduce((sum, value) => sum + value.amount, 0), 3334, 'host residual and guest payments preserve 10,000');
    for (const payment of payments) publicUser(payment.user);
    await rejectsStatus(service.selectItems(basic.id, 2, { itemIds: [] }), 400);
    await rejectsStatus(service.updateItems(basic.id, 1, { items: [] }), 400);
    await rejectsStatus(service.revertToDraft(basic.id, 1), 400);
    await rejectsStatus(service.updatePayment(basic.id, 2, 2, 'PAID'), 403);
    await rejectsStatus(service.updatePayment(basic.id, 1, 2, 'PENDING'), 400);
    console.log('PASS: actual SQL allocation, empty selection, legacy host access and private responses.');

    const beforePaid = messages.length;
    await Promise.all([
      service.updatePayment(basic.id, 1, 2, 'PAID'),
      service.updatePayment(basic.id, 1, 2, 'PAID'),
    ]);
    assert.equal(messages.length - beforePaid, 1, 'duplicate PAID requests announce only once');
    assert.equal((await repo(Settlement).findOneByOrFail({ id: basic.id })).status, 'CONFIRMED');
    failMessages = true;
    const finalPayment = await service.updatePayment(basic.id, 1, 3, 'PAID');
    failMessages = false;
    assert.equal(finalPayment.status, 'PAID');
    publicUser(finalPayment.user);
    assert.equal((await repo(Settlement).findOneByOrFail({ id: basic.id })).status, 'COMPLETED');
    assert.ok(warningCount > 0, 'chat failure was handled without losing committed state');
    const afterComplete = messages.length;
    await service.updatePayment(basic.id, 1, 3, 'PAID');
    assert.equal(messages.length, afterComplete, 'completed retries must not repeat announcements');
    console.log('PASS: concurrent duplicate PAID, final completion and committed state after chat failure.');

    const race = await flow();
    const acquired = deferred();
    const attempted = deferred();
    const release = deferred();
    const connectionIds = [];
    let lockedRunner;
    let secondAcquired = false;
    originalRunner = source.createQueryRunner.bind(source);
    source.createQueryRunner = (...args) => {
      const runner = originalRunner(...args);
      if (!lockedRunner) lockedRunner = runner;
      const findOne = runner.manager.findOne.bind(runner.manager);
      runner.manager.findOne = async (entity, options) => {
        if (entity !== Settlement || options?.lock?.mode !== 'pessimistic_write') return findOne(entity, options);
        await runner.query('SET SESSION innodb_lock_wait_timeout=5');
        connectionIds.push((await runner.query('SELECT CONNECTION_ID() AS id'))[0].id);
        if (runner !== lockedRunner) attempted.resolve();
        const result = await findOne(entity, options);
        if (runner === lockedRunner) {
          acquired.resolve();
          await release.promise;
        } else secondAcquired = true;
        return result;
      };
      return runner;
    };
    let confirmation;
    let lateSelection;
    try {
      confirmation = service.confirm(race.id, 1);
      await bounded(Promise.race([
        acquired.promise,
        confirmation.then(() => { throw new Error('confirmation finished without acquiring the row lock'); }),
      ]));
      lateSelection = service.selectItems(race.id, 2, { itemIds: [] }).then(
        value => ({ value }), error => ({ error }),
      );
      await bounded(attempted.promise);
      assert.equal(secondAcquired, false, 'late selection waits while confirmation owns the row lock');
      assert.equal(new Set(connectionIds).size, 2, 'the test uses two real MySQL connections');
      release.resolve();
      await bounded(confirmation);
      const result = await bounded(lateSelection);
      assert.equal(result.error?.getStatus(), 400, 'selection sees CONFIRMED only after acquiring the lock');
      const selected = await service.findOne(race.id, 1);
      assert.deepEqual(selected.items[0].members.map(value => value.userId).sort(), [1, 2, 3]);
      assert.deepEqual((await service.getPayments(race.id, 1)).map(value => value.amount), [3333, 3333]);
    } finally {
      release.resolve();
      source.createQueryRunner = originalRunner;
      await Promise.allSettled([confirmation, lateSelection].filter(Boolean));
      originalRunner = undefined;
    }
    console.log('PASS: actual two-connection confirmation/select race preserves the confirmed snapshot.');

    const both = await flow();
    await service.confirm(both.id, 1);
    const beforeBoth = messages.length;
    await Promise.all([service.updatePayment(both.id, 1, 2, 'PAID'), service.updatePayment(both.id, 1, 3, 'PAID')]);
    assert.equal((await repo(Settlement).findOneByOrFail({ id: both.id })).status, 'COMPLETED');
    assert.equal(messages.slice(beforeBoth).filter(value => value.message === '🎉 모든 정산이 완료되었습니다!').length, 1);
    const zero = await flow(1);
    await service.confirm(zero.id, 1);
    payments = await service.getPayments(zero.id, 1);
    assert.deepEqual(payments.map(value => [value.amount, value.status]), [[0, 'PAID'], [0, 'PAID']]);
    assert.equal((await repo(Settlement).findOneByOrFail({ id: zero.id })).status, 'COMPLETED');
    console.log('PASS: parallel final payments announce completion once; zero-amount transfers complete automatically.');
  } finally {
    if (originalRunner) source.createQueryRunner = originalRunner;
    if (source.isInitialized) {
      await source.dropDatabase();
      await source.destroy();
    }
  }
}

main().catch(error => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
