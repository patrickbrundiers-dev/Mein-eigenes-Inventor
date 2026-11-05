// Namen der Ursprungsebenen (SolidCraft-Abgleich Runde 2, W6): »XY-Ebene« oder nach Ansicht »Oben (XY)«.
// Z zeigt nach oben: XY = Oben, XZ = Vorne, YZ = Rechts. Die Einstellung setzt app.applyPrefs.
const VIEW = { XY: "Oben", XZ: "Vorne", YZ: "Rechts" };
let mode = "xyz";
export const setPlaneNames = (m) => { mode = m === "ansicht" ? "ansicht" : "xyz"; };
export const planeNames = () => mode;
export const planeLabel = (pl) => (mode === "ansicht" && VIEW[pl] ? `${VIEW[pl]} (${pl})` : `${pl}-Ebene`);
