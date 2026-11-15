import { db } from '../../db/db';
import { repo } from '../../db/repo';
import { PROFILE_ID, type Profile } from '../../db/types';
import type { ProfileFields } from '../../lib/profile';

/** Creates the single profile record on first save (fixed id), updates it afterwards. */
export async function saveProfile(fields: ProfileFields): Promise<Profile> {
  return repo.atomically(async () => {
    const existing = await db.profile.get(PROFILE_ID);
    if (!existing) return repo.create('profile', { ...fields, id: PROFILE_ID });
    if (existing.deleted) await repo.restore('profile', PROFILE_ID);
    return repo.update('profile', PROFILE_ID, fields);
  });
}
