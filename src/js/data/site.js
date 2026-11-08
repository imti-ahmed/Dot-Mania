/*
 * Site settings for the status bar at the top right (what it shows when nothing else is happening).
 *
 *   version   The current version, shown in the status bar and on About. Bump it with every Buildlog entry.
 *   repo      GitHub "owner/name". Its star count is shown. Leave '' to hide stars.
 *   views     A visit counter on the free Abacus service (abacus.jasoncameron.dev), no account needed.
 *             `namespace` + `key` name the counter; anyone who knows them could add to it, so keep them
 *             specific to this site. Leave namespace '' to turn views off.
 *             A visit is counted once per browser session, and only on the live site: on localhost or when
 *             opened as a file it just reads the number.
 *             A GitHub Action (.github/workflows/views-backup.yml) saves the count to views.json on the `stats`
 *             branch every 6 hours, and the app shows the larger of the two numbers. To switch services, seed the
 *             new counter with the value from views.json and change `views` here.
 */
window.SITE = {
  version: '0.27.0',
  repo: 'imti-ahmed/Dot-Mania',
  views: { namespace: 'dot-mania-imti-ahmed', key: 'views' }
};
