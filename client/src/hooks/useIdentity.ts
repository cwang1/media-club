import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, consumeSignInLink, getToken, setToken } from '../api';
import type { Member, Session } from '../types';

export type IdentityStatus = 'loading' | 'ready' | 'error';

/**
 * Who this browser is: the member list plus the current member, resolved from the stored key.
 * Its error is tracked separately from the item list, and `reload` retries both requests.
 */
export function useIdentity() {
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<Member | null>(null);
  const [status, setStatus] = useState<IdentityStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus('loading');
    try {
      const whoAmI = getToken()
        ? api.me().catch((e: unknown) => {
            // a key the server no longer recognises (e.g. the profile was released): forget it
            if (e instanceof ApiError && e.status === 401) {
              setToken(null);
              return null;
            }
            throw e;
          })
        : Promise.resolve(null);
      const [list, current] = await Promise.all([api.members(), whoAmI]);
      setMembers(list);
      setMe(current);
      setError(null);
      setStatus('ready');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    consumeSignInLink();
    void reload();
  }, [reload]);

  const adopt = ({ member, token }: Session) => {
    setToken(token);
    setMe(member);
    setMembers((list) =>
      [...list.filter((m) => m.id !== member.id), member].sort((a, b) => a.name.localeCompare(b.name)),
    );
  };

  const claim = async (memberId: number) => adopt(await api.claim(memberId));
  const join = async (name: string) => adopt(await api.join(name));

  const release = async () => {
    await api.release();
    setToken(null);
    setMembers((list) => list.map((m) => (m.id === me?.id ? { ...m, claimed: false } : m)));
    setMe(null);
  };

  /** Call when the server says we're not signed in after all. */
  const forget = () => {
    setToken(null);
    setMe(null);
  };

  return { members, me, status, error, reload, claim, join, release, forget };
}
