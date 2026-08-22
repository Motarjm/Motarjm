// TranslatorProfilePanel.jsx
import React, { useEffect, useRef, useState } from 'react';
import '../assets/TranslatorProfilePanel.css';

const AUTOSAVE_DELAY_MS = 500;

const ROLE_PLACEHOLDER = 'مترجم خبير متخصص في الترجمة الأدبية بين الإنجليزية والعربية';
const PREFERENCES_PLACEHOLDER = [
  'استخدم اللغة العربية الفصحى المعاصرة',
  'حافظ على نبرة رسمية دون تكلّف',
  'تجنّب الترجمة الحرفية للتعابير الاصطلاحية',
].join('\n');

// Turns free-typed lines into a clean bullet array — strips any leading
// -, •, or * the user already typed so we don't end up with double bullets.
const linesToBullets = (text) =>
  text
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);

const SKILL_FILE_ACCEPT = '.md,.txt';

const TranslatorProfilePanel = ({
  onSave, // (data) => void — called automatically (debounced) whenever role/preferences change
  initialData = {},
  isActive,
  onToggleActive,
  onExtractFromFile, // async (file) => { role: string, preferences: string[] }
}) => {
  // If the profile was previously saved from an uploaded skill file, reopen
  // on the 'upload' tab so the existing file chip (and its remove button)
  // is visible, instead of silently defaulting back to 'manual' and hiding
  // a stale skillFileName the user can no longer see or clear via the UI.
  const [mode, setMode] = useState(initialData.skillFileName ? 'upload' : 'manual'); // 'manual' | 'upload'
  const [role, setRole] = useState(initialData.role || '');
  const [preferencesText, setPreferencesText] = useState(
    Array.isArray(initialData.preferences)
      ? initialData.preferences.join('\n')
      : (initialData.preferences || '')
  );
  const [skillFileName, setSkillFileName] = useState(initialData.skillFileName || '');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const fileInputRef = useRef();

  const bulletPreview = linesToBullets(preferencesText);

  // Skip the very first run so mounting with initialData doesn't immediately
  // fire a redundant save of data the parent already has.
  const isFirstRun = useRef(true);
  const saveTimeoutRef = useRef(null);

  // Kept in sync with the latest role/preferencesText/skillFileName on every
  // render so the unmount-flush below can read current values without
  // needing them in its own dependency array (which would otherwise refire
  // the flush-on-cleanup for every keystroke, not just on unmount).
  const latestValuesRef = useRef({ role, preferencesText, skillFileName });
  latestValuesRef.current = { role, preferencesText, skillFileName };

  const flushSave = () => {
    if (!onSave) return;
    const { role: r, preferencesText: pt, skillFileName: sfn } = latestValuesRef.current;
    onSave({
      role: r.trim(),
      preferences: linesToBullets(pt),
      skillFileName: sfn || null,
    });
  };

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    if (!onSave) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      flushSave();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, preferencesText, skillFileName]);

  // Flush-on-unmount: if the panel is closed (unmounted) while a debounced
  // save is still pending — e.g. the user types and immediately taps the
  // drawer cell to close the panel — the effect cleanup above only cancels
  // the timeout. Without this, that last edit is silently lost and never
  // reaches the parent or sessionStorage. This runs once on unmount only
  // (empty deps + refs), and saves immediately if a save was still pending.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        flushSave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSkillFileName(file.name);
    setExtractError('');

    if (!onExtractFromFile) return;

    setIsExtracting(true);
    try {
      const extracted = await onExtractFromFile(file);
      if (extracted?.role) setRole(extracted.role);
      // Guard against an empty array: [] is truthy in JS, so a naive
      // `if (extracted?.preferences)` would still fire and wipe out any
      // preferences the user had already typed manually, even though the
      // file only contributed a role. Only overwrite when there's
      // something to overwrite with.
      if (Array.isArray(extracted?.preferences) ? extracted.preferences.length > 0 : !!extracted?.preferences) {
        const asText = Array.isArray(extracted.preferences)
          ? extracted.preferences.join('\n')
          : extracted.preferences;
        setPreferencesText(asText);
      }
    } catch (err) {
      console.error('Failed to extract profile from skill file:', err);
      setExtractError('تعذّر استخراج البيانات من الملف. يمكنك تعديل الحقول يدويًا أدناه');
    } finally {
      setIsExtracting(false);
    }
  };

  const removeSkillFile = () => {
    setSkillFileName('');
    setExtractError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const hasContent = role.trim().length > 0 || bulletPreview.length > 0;

  return (
    <div className="tp-panel">
      <div className="tp-panel-header">
        <div className="tp-panel-title-group">
          <h3 className="tp-panel-title">شخصية المترجم وتفضيلاتك</h3>
          <p className="tp-panel-subtitle">
            حدّد الدور الذي يجب أن يتبناه المترجم، وأضف تفضيلاتك ليأخذها بعين الاعتبار أثناء الترجمة
          </p>
        </div>
        {hasContent && onToggleActive && (
          <button
            type="button"
            className={`tp-toggle-chip ${isActive ? 'is-on' : ''}`}
            onClick={onToggleActive}
          >
            <span className="tp-toggle-dot" />
            {isActive ? 'مُفعّل' : 'غير مُفعّل'}
          </button>
        )}
      </div>

      <div className="tp-mode-switch">
        <button
          type="button"
          className={`tp-mode-btn ${mode === 'manual' ? 'is-active' : ''}`}
          onClick={() => setMode('manual')}
        >
          اكتب يدويًا
        </button>
        <button
          type="button"
          className={`tp-mode-btn ${mode === 'upload' ? 'is-active' : ''}`}
          onClick={() => setMode('upload')}
        >
          ارفع ملف مهارة
        </button>
      </div>

      {mode === 'upload' && (
        <div className="tp-upload-block">
          {!skillFileName ? (
            <button
              type="button"
              className="tp-upload-btn"
              onClick={() => fileInputRef.current.click()}
              disabled={isExtracting}
            >
              <span className="tp-upload-icon">📎</span>
              اختر ملف المهارة (MD, TXT)
            </button>
          ) : (
            <div className="tp-file-chip">
              <span className="tp-file-chip-icon">📄</span>
              <span className="tp-file-chip-name" title={skillFileName}>
                {isExtracting ? `جارٍ الاستخراج... ${skillFileName}` : skillFileName}
              </span>
              <button
                type="button"
                className="tp-file-chip-remove"
                onClick={removeSkillFile}
                aria-label="إزالة الملف"
              >
                ✕
              </button>
            </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileSelected}
            accept={SKILL_FILE_ACCEPT}
          />
          {extractError && <p className="tp-error-text">{extractError}</p>}
          <p className="tp-upload-hint">
            سنحاول استخراج الدور والتفضيلات من الملف تلقائيًا — يمكنك مراجعتها وتعديلها أدناه قبل الحفظ
          </p>
        </div>
      )}

      <div className="tp-field">
        <label className="tp-label" htmlFor="tp-role">دور المترجم</label>
        <input
          id="tp-role"
          type="text"
          className="tp-role-input"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder={ROLE_PLACEHOLDER}
          maxLength={160}
        />
        <span className="tp-field-hint">سطر أو سطران يصفان هوية المترجم وتخصصه</span>
      </div>

      <div className="tp-field">
        <label className="tp-label" htmlFor="tp-preferences">التفضيلات</label>
        <div className="tp-preferences-input-wrap">
          <textarea
            id="tp-preferences"
            className="tp-preferences-textarea"
            value={preferencesText}
            onChange={(e) => setPreferencesText(e.target.value)}
            placeholder={PREFERENCES_PLACEHOLDER}
            rows={5}
          />
        </div>
        <span className="tp-field-hint">كل سطر جديد يصبح نقطة تفضيل مستقلة</span>
      </div>

      
    </div>
  );
};

export default TranslatorProfilePanel;