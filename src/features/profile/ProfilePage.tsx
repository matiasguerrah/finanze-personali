import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useActivities, useProfile } from '../../db/hooks';
import type { Profile } from '../../db/types';
import { isActiveOn } from '../../lib/activities';
import { todayRome } from '../../lib/dates';
import { normalizeProfile, validateProfile, type ProfileError } from '../../lib/profile';
import { inputClass, labelClass, primaryButton } from '../../components/form';
import { useToast } from '../../state/toast';
import { saveProfile } from './actions';

const ERROR_TEXT: Record<ProfileError, string> = {
  vatNumber: 'Partita IVA non valida: servono 11 cifre con la cifra di controllo corretta.',
  taxCode: 'Codice fiscale non valido: controlla i 16 caratteri.',
  pec: 'Indirizzo PEC non valido.',
};

export function ProfilePage() {
  const profile = useProfile();
  // Render the form only once the stored profile is known, so it starts with the saved values.
  if (profile === undefined) return null;
  return <ProfileForm profile={profile} />;
}

function ProfileForm({ profile }: { profile: Profile | null }) {
  const activities = useActivities();
  const toast = useToast();
  const today = todayRome();
  const [values, setValues] = useState({
    firstName: profile?.firstName ?? '',
    lastName: profile?.lastName ?? '',
    vatNumber: profile?.vatNumber ?? '',
    taxCode: profile?.taxCode ?? '',
    pec: profile?.pec ?? '',
  });
  const [touched, setTouched] = useState<Partial<Record<ProfileError, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const normalized = normalizeProfile(values);
  const errors = validateProfile(normalized);
  const showError = (f: ProfileError) => (submitted || touched[f]) && errors.includes(f);
  const set = (k: keyof typeof values) => (v: string) => setValues((s) => ({ ...s, [k]: v }));

  async function save() {
    setSubmitted(true);
    if (errors.length) return;
    await saveProfile(normalized);
    setValues(normalized);
    toast({ message: 'Profilo salvato', tone: 'success' });
  }

  const field = (
    key: keyof typeof values,
    label: string,
    { className: extraClass = '', ...props }: InputHTMLAttributes<HTMLInputElement> = {},
    error?: ProfileError,
    hint?: ReactNode,
  ) => (
    <label className={labelClass}>
      {label}
      <input
        className={`${error && showError(error) ? inputClass.replace('border-line', 'border-danger') : inputClass} ${extraClass}`}
        value={values[key]}
        onChange={(e) => set(key)(e.target.value)}
        onBlur={() => error && setTouched((t) => ({ ...t, [error]: true }))}
        aria-invalid={error ? showError(error) : undefined}
        aria-describedby={error && showError(error) ? `${key}-err` : undefined}
        {...props}
      />
      {error && showError(error) ? (
        <span id={`${key}-err`} className="text-danger">
          {ERROR_TEXT[error]}
        </span>
      ) : (
        hint && <span className="text-xs">{hint}</span>
      )}
    </label>
  );

  const current = activities.filter((a) => isActiveOn(a, today));

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="who-h" className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <h2 id="who-h" className="font-semibold">
          Dati anagrafici e fiscali
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field('firstName', 'Nome', { autoComplete: 'given-name' })}
          {field('lastName', 'Cognome', { autoComplete: 'family-name' })}
          {field(
            'vatNumber',
            'Partita IVA',
            { inputMode: 'numeric', autoComplete: 'off', placeholder: '11 cifre' },
            'vatNumber',
          )}
          {field(
            'taxCode',
            'Codice fiscale',
            {
              autoComplete: 'off',
              autoCapitalize: 'characters',
              spellCheck: false,
              className: 'uppercase',
            },
            'taxCode',
          )}
          <div className="sm:col-span-2">
            {field(
              'pec',
              'PEC',
              { type: 'email', inputMode: 'email', autoComplete: 'email', spellCheck: false },
              'pec',
            )}
          </div>
        </div>
        <p className="text-xs text-muted">
          Tutti i campi sono facoltativi. Restano sul dispositivo e nel tuo Google Sheet quando
          attiverai la sincronizzazione.
        </p>
        <button type="button" onClick={() => void save()} className={primaryButton}>
          Salva
        </button>
      </section>

      <section aria-labelledby="ateco-h" className="flex flex-col gap-2">
        <h2 id="ateco-h" className="px-1 text-sm font-semibold text-muted">
          Codici ATECO attivi oggi
        </h2>
        <Link
          to="/altro/attivita"
          className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface p-4 hover:bg-surface-2"
        >
          <span className="flex flex-1 flex-col gap-0.5">
            {current.length === 0 ? (
              <span className="text-muted">Nessuna attività configurata</span>
            ) : (
              current.map((a) => (
                <span key={a.id}>
                  <span className="font-medium tabular-nums">{a.atecoCode || '—'}</span>
                  <span className="text-muted"> · {a.name}</span>
                </span>
              ))
            )}
            <span className="text-sm text-accent">Modifica in Attività professionali</span>
          </span>
          <ChevronRight size={18} className="text-muted" aria-hidden="true" />
        </Link>
        <p className="px-1 text-xs text-muted">
          Il codice ATECO si gestisce per attività, con le date di inizio e fine: così, se lo cambi,
          gli incassi già registrati restano attribuiti al codice giusto.
        </p>
      </section>
    </div>
  );
}
