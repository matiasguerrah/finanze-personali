import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import { PROFILE_ID } from '../../db/types';
import { saveProfile } from './actions';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const fields = {
  firstName: 'Mario',
  lastName: 'Rossi',
  vatNumber: '01234567897',
  taxCode: 'RSSMRA85T10A562S',
  pec: 'mario.rossi@pec.example.it',
};

describe('saveProfile', () => {
  it('keeps a single record with the fixed id and queues it for sync', async () => {
    await saveProfile(fields);
    await saveProfile({ ...fields, pec: 'nuova@pec.example.it' });
    const all = await db.profile.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: PROFILE_ID, pec: 'nuova@pec.example.it', deleted: false });
    const out = await db.outbox.where({ table: 'profile', recordId: PROFILE_ID }).toArray();
    expect(out).toHaveLength(1);
    expect(out[0]!.payload).toMatchObject({ pec: 'nuova@pec.example.it' });
  });
});
