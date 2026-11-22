/**
 * The settings view: the spoken language and a button to hear it, the ball
 * check and its model's input size, which revision of the detection models
 * runs, how sure the pose model must be, whether the board keeps the camera's
 * video, and the versions this phone runs.
 *
 * Each change is stored at once, and the board reads it at its next start.
 */
import { chosenVoice, say } from './audio';
import { ballInputChoices, modelRevisions, modelsInUse } from './config';
import { $ } from './dom';
import { changeLanguage, decimal, onLanguage, t } from './i18n';
import { canRecordVideo } from './record';
import {
  LANGUAGES,
  ballCheckOn,
  deviceLanguage,
  language,
  languageChoice,
  poseConfidence,
  recordVideo,
  setBallCheckOn,
  setBallInput,
  type LanguageChoice,
  type LanguageTag,
  setModels,
  setPoseConfidence,
  setRecordVideo,
} from './settings';
import { watchVersion } from './version';

/**
 * Names the one voice that will speak the count.
 *
 * Listing every voice for the language answers the wrong question: a phone
 * with ten Brazilian voices and one from Portugal reads as a wall of Brazil,
 * and nothing on the page says which of them the count comes out in.
 */
function voiceLine(): string {
  if (!('speechSynthesis' in window)) return t('settings.cannotSpeak');
  const tag = language().toLowerCase();
  const chosen = chosenVoice();
  if (!chosen) return t('settings.noVoice');
  const others = speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(tag.split('-')[0])).length;
  // 'en' names no region, so any English voice is the one asked for.
  const asked = tag.includes('-') ? tag : null;
  const speaks = chosen.lang.toLowerCase().replace('_', '-');
  return t('settings.voice')(
    chosen.name,
    chosen.lang,
    Boolean(asked) && speaks !== asked,
    Math.max(0, others - 1),
  );
}

export function bindSettings(): void {
  const choices: LanguageChoice[] = ['device', ...(Object.keys(LANGUAGES) as LanguageTag[])];
  const listLanguages = () => {
    $('language').replaceChildren(
      ...choices.map((choice) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'choice';
        pill.textContent =
          choice === 'device' ? t('settings.deviceLanguage')(LANGUAGES[deviceLanguage()]) : LANGUAGES[choice];
        pill.setAttribute('aria-pressed', String(choice === languageChoice()));
        pill.addEventListener('click', () => changeLanguage(choice));
        return pill;
      }),
    );
  };
  listLanguages();
  const showVoice = () => ($('voices').textContent = voiceLine());
  showVoice();
  // Voices arrive late on some engines.
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', showVoice);
  $('test').addEventListener('click', () => {
    if (!say('12')) $('voices').textContent = t('settings.cannotSpeak');
  });

  const ball = $<HTMLInputElement>('ball-check');
  ball.checked = ballCheckOn();
  ball.addEventListener('change', () => setBallCheckOn(ball.checked));

  const listBallInputs = () => {
    const { inputs, inUse } = ballInputChoices();
    $('ball-input').replaceChildren(
      ...inputs.map((input) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'choice';
        pill.textContent = t('settings.pixels')(input);
        pill.setAttribute('aria-pressed', String(input === inUse));
        pill.addEventListener('click', () => {
          setBallInput(input);
          listBallInputs();
        });
        return pill;
      }),
    );
  };
  listBallInputs();

  const models = $<HTMLSelectElement>('models');
  const [shipped] = modelRevisions();
  for (const { revision } of modelRevisions()) models.add(new Option(revision, revision));
  // Each choice names the day its detectors were trained, as the app's language writes a date.
  const nameModels = () => {
    for (const [i, { revision, trained }] of modelRevisions().entries()) {
      const date = trained
        ? ` (${new Date(trained).toLocaleDateString(language(), { day: 'numeric', month: 'short' })})`
        : '';
      models.options[i].text = `${revision}${date}`;
    }
  };
  nameModels();
  const showModels = () => {
    const inUse = modelsInUse();
    // A candidate the page's address asks for is not a choice here, and it overrides the stored one.
    const asked = !modelRevisions().some(({ revision }) => revision === inUse);
    models.value = asked ? shipped.revision : inUse;
    models.disabled = asked;
    $('models-note').textContent = asked
      ? t('settings.modelsAsked')(inUse)
      : inUse === shipped.revision
        ? t('settings.modelsShipped')
        : t('settings.modelsHub');
    $('settings-models').textContent = inUse;
  };
  showModels();
  models.addEventListener('change', () => {
    setModels(models.value);
    showModels();
    // Another revision may offer other sizes.
    listBallInputs();
  });

  const confidence = $<HTMLInputElement>('confidence');
  const showConfidence = () => {
    const value = Number(confidence.value);
    $('confidence-value').textContent = decimal(value, 2);
    const share = (value - Number(confidence.min)) / (Number(confidence.max) - Number(confidence.min));
    confidence.style.setProperty('--share', String(share));
  };
  confidence.value = String(poseConfidence());
  showConfidence();
  confidence.addEventListener('input', () => {
    setPoseConfidence(Number(confidence.value));
    showConfidence();
  });

  const record = $<HTMLInputElement>('record');
  record.checked = recordVideo();
  record.disabled = !canRecordVideo();
  $('record-warning').hidden = canRecordVideo();
  record.addEventListener('change', () => setRecordVideo(record.checked));

  let version: string | null = null;
  const showVersion = () => ($('settings-version').textContent = version || t('settings.notInstalled'));
  watchVersion((installed) => {
    version = installed;
    showVersion();
  });

  onLanguage(() => {
    listLanguages();
    showVoice();
    nameModels();
    showModels();
    showConfidence();
    showVersion();
  });
}
