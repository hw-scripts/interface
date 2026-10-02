# Dictionary workshop

`translations.json` is the source of truth. Each key contains `en`, `uk`, and `ru` translations. Edit it here, then generate the flat dictionaries in the parent `locales` directory.

Run these commands from the repository root. File paths are resolved relative to the script, so its working directory does not affect where it reads or writes dictionaries.

Generate `locales/en.json`, `locales/uk.json`, and `locales/ru.json`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\locales\workshop\i18n.ps1 -Action Split
```

Check that all three files match the source:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\locales\workshop\i18n.ps1 -Action Validate
```

Add a new key and regenerate all three dictionaries:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\locales\workshop\i18n.ps1 -Action Add -Key EXAMPLE -English "English text" -Ukrainian "Ukrainian text" -Russian "Russian text"
```

Replace the example text with the actual translations. `Add` rejects existing keys. To change a translation, edit `translations.json` and run `Split`.

Rebuild the source from the existing flat files only when intentionally importing changes from them:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\locales\workshop\i18n.ps1 -Action Merge
```

`Merge` overwrites `workshop/translations.json`. All three dictionaries must contain the same keys. Missing, empty, or non-string translations cause an error. All languages are checked before generated files are written.

Run `Validate` before committing, and commit the source together with the generated dictionaries. This repository currently has no GitHub workflow to generate dictionary pull requests.

`interface.js` loads the packaged `locales/<language>.json` through `web_accessible_resources`. It does not load dictionaries from a Git branch or use the workshop source at runtime.
