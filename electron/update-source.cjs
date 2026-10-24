// Woher die Updates kommen. Im Installer fehlt das Feld "build" der package.json (electron-builder entfernt es),
// deshalb zuerst "repository" lesen und "build.publish" nur als Ersatz für die Entwicklerversion nehmen.
function updateSource(pkg) {
  const r = pkg.repository;
  const url = typeof r === "string" ? r : r && r.url;
  const m = url && /github(?:\.com[/:]|:)([^/]+)\/([^/#]+?)(?:\.git)?\/?$/.exec(url);
  if (m) return { owner: m[1], repo: m[2] };
  const p = (pkg.build && pkg.build.publish && pkg.build.publish[0]) || {};
  if (p.owner && p.repo) return { owner: p.owner, repo: p.repo };
  return null;
}

module.exports = { updateSource };
