// Fehler eines Generators mit dem betroffenen Parameter (V5): das Eigenschaftenfeld zeigt die Meldung direkt am Feld.
// Hinweise/Warnungen tragen den Parameter als key: { level, message, key }.

/** Error mit key = Schlüssel des Parameters im Schema */
export const fieldError = (message, key) => Object.assign(new Error(message), { key });
