/** Shared tick journal helper. */
export function journalPush(journal, entry) {
  journal.push({ at: new Date().toISOString(), ...entry });
}
