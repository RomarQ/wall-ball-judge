/**
 * The app's text in each language the settings offer, and the means to show it.
 *
 * The page's markup names its texts with `data-i18n` for an element's text,
 * and `data-i18n-label`, `data-i18n-title` and `data-i18n-placeholder` for
 * those attributes. A script asks `t()`. A text that takes values is a
 * function, so each language orders the words its own way. Every language
 * holds every text with the same values: TypeScript refuses a build that
 * lacks one.
 *
 * Diagnostic text stays in English in every language: the status line's
 * details and internal errors are read by whoever fixes the app, and match
 * the code and the docs.
 */
import type { Warning } from './board';
import { language, setLanguage, type LanguageChoice, type LanguageTag } from './settings';

type Chip = 'GPU' | 'CPU';

const en = {
  'title.home': 'Wall Ball Judge',
  'title.judge': 'Judge board | Wall Ball Judge',
  'title.settings': 'Settings | Wall Ball Judge',

  'brand.home': 'Wall Ball Judge, home',
  'nav.judge': 'Judge board',
  'nav.settings': 'Settings',

  'desktop.hint':
    'Your browser shows the app as a desktop site, so everything is small. In a browser tab on this site, untick Desktop site in the menu. Then open the app again.',
  'desktop.close': 'Hide',

  'home.lede': 'Use your device to judge your wall balls.',
  'home.demoTitle':
    'Two stations, seen from behind. On the left a man throws to the upper target, and on the right a woman throws to the lower target. A rep counts when the hips go below the knees and the ball then hits the athlete’s target. A squat above parallel, or a man’s throw that reaches only the lower target, is a no-rep.',
  'home.ruleDepth': 'Hips below the knees',
  'home.ruleTarget': 'Ball on the athlete’s target',
  'home.demoCaption': 'Men throw to the upper target. Women throw to the lower target.',
  'home.recording': 'Replay a video',
  'home.live': 'Start',
  'home.settings': 'Settings',
  'home.phone': 'This device',
  'home.runs': 'Can this device run the app?',
  'home.maybe': 'Maybe',
  'home.readySlow': 'The app works, but some of its parts are too slow or do not run.',
  'home.readyBad': 'The app cannot judge live here: the camera or the pose model does not run.',
  'home.lastSet': 'Last set',
  'home.offline': 'Ready for offline use',
  'home.installed': 'Installed',
  'home.check': 'Check this device',
  'home.checkSize':
    'Optional. Tests the speed of this device and keeps the app for offline use. Downloads about 50 MB.',
  'home.recheck': 'Check again',
  'home.place': 'How to position the device',
  'home.planLabel':
    'Seen from above: the device stands at the athlete’s side or behind the athlete, and sees the athlete and the target. A device close to the wall under the target is wrong.',
  'home.planTarget': 'target',
  'home.planAthlete': 'athlete',
  'home.planSide': 'at the side',
  'home.planBehind': 'behind',
  'home.planClose': 'too close',
  'home.noteSide': 'Stand it at the athlete’s side or behind them, at hip height.',
  'home.notePicture': 'The picture must show the hips, the knees and the target.',
  'home.noteClose': 'Do not put it near the wall or under the target.',
  'home.howTo': 'How to use it',
  'home.howToClose': 'Close the video',
  'home.private': 'Your video stays on your device.',
  'home.contact': 'Contact',
  'home.github': 'GitHub',
  'home.huggingFace': 'Hugging Face',
  'home.version': (version: string) => `Version ${version}`,
  'home.yes': 'Yes',
  'home.no': 'No',
  'home.notYet': 'Not yet',
  'home.checking': 'Checking…',
  'home.devServer': 'Not on the dev server',
  'home.notInBrowser': 'Not in this browser',
  'home.notChecked': 'Not checked',
  'home.notKnown': 'Not known yet',
  'home.firstSet': 'The first live set measures the pose model’s speed.',
  'home.frames': (n: number) => `${n} ${n === 1 ? 'frame' : 'frames'} a second`,
  'home.poseModel': (small: boolean, chip: Chip) => `${small ? 'small' : 'full'} pose model on the ${chip}`,
  'home.installIos': 'To install the app, tap Share, then tap Add to Home Screen.',
  'home.installOther':
    'To install the app, open the browser menu with the three dots, then tap Install app or Add to Home screen.',
  'home.install': 'Install',
  'home.mayClear': 'The browser may clear the models when the device needs space.',
  'home.mayClearInstall':
    'The browser may clear the models when the device needs space. Install the app to keep them.',
  'home.step': (step: number, of: number, name: string) => `Step ${step} of ${of}: ${name}`,
  'home.storing': 'Storing the files on the device',
  'home.notKept':
    'The device did not keep the files. Make sure that the device has free storage, then check again.',
  'home.stopped': (why: string) =>
    `The check stopped (${why}). Make sure that the device is online, then check again.`,
  'check.pose': 'the pose model',
  'check.ball': 'the ball detector',
  'check.target': 'the target detector',
  'check.speed': 'a speed test of each model on the GPU and the CPU',
  'camera.notHttps':
    'This page is not on HTTPS, so the browser blocks the camera. You can still replay a video.',
  'camera.none': 'This browser gives the app no camera. You can still replay a video.',

  'board.label': 'Judge board',
  'board.linking': 'Linking…',
  'board.startCamera': 'Start the camera',
  'board.playRecording': 'Replay a video',
  'board.saveVideo': 'Save the last video',
  'board.stop': 'Stop',
  'board.details': 'Tap for the details',
  'board.refind': 'Find the target again',
  'board.flip': 'Switch camera',
  'board.go': 'Start the set',
  'board.find': 'Find the target',
  'board.targetFaultTitle': 'Target no-reps. Tap to add one by hand.',
  'board.moveFaultTitle': 'Squat no-reps. Tap to add one by hand.',
  'board.target': 'Target',
  'board.squat': 'Squat',
  'board.noReps': 'No-reps',
  'board.reps': 'Reps',
  'board.requiredTitle':
    'The highlighted target is the one this athlete must reach. Tap a plate when the ball hits it.',
  'board.upper': 'Upper',
  'board.lower': 'Lower',
  'board.hitUpper': 'The ball hit the upper target',
  'board.hitLower': 'The ball hit the lower target',
  'board.timeTitle': 'From the start of the first rep to the end of the set',
  'board.time': 'Time',
  'board.reset': 'Reset',
  'board.nothingToReset': 'Nothing to reset',
  'board.tapToClear': 'Tap again to reset',
  'board.pace': (secondsPerRep: string, target: number, at: string | null) =>
    at ? `${secondsPerRep} s a rep · ${target} at ${at}` : `${secondsPerRep} s a rep`,
  'board.chip': (model: 'ball' | 'finder' | 'pose', chip: string) =>
    `${{ ball: 'Ball', finder: 'Target finder', pose: 'Pose' }[model]} on ${chip}`,
  'board.recording': 'recording',
  'board.starting': 'starting…',
  'board.counting': 'counting',
  'board.goBanner': 'Go',
  'board.looking': 'looking for the target…',
  'board.lookingBanner': 'Looking for the target',
  'board.searched': (chip: string, seconds: string) => ` · searched on the ${chip} in ${seconds} s`,
  'board.placed': 'target found and placed',
  'board.placedBanner': 'Target placed',
  'board.oneCandidate': 'one possible target, tap it to place it',
  'board.oneCandidateBanner': 'Tap the target to place it',
  'board.candidates': (n: number) => `${n} possible targets, tap the right one`,
  'board.candidatesBanner': (n: number) => `${n} possible targets: tap one`,
  'board.atSquat': (n: number) =>
    n === 1
      ? 'one possible target, placed when the athlete squats under it, or tap it'
      : `${n} possible targets, the athlete’s first squat picks theirs, or tap one`,
  'board.atSquatBanner': 'Squat under your target',
  'board.picked': 'target placed above the athlete, drag it to adjust',
  'board.noTarget': (best: string | null) =>
    `no target found${best ? ` (best guess ${best})` : ''}, tap it on the screen`,
  'board.noTargetBanner': 'No target found: tap it',
  'board.finderUnavailable': (why: string) => `target finder unavailable: ${why}`,
  'board.finderUnavailableBanner': 'Target finder unavailable',
  'board.placedByTap': 'target placed where you tapped, drag it to adjust',
  'board.placedPick': 'target placed, drag it to adjust',
  'board.untargeted': 'no target placed, judging depth only',
  'board.untargetedBanner': 'No target: judging depth only',
  'board.failed': (recording: boolean, why: string) =>
    `${recording ? 'the video' : 'the camera'} failed: ${why}`,

  'session.opening': 'opening the camera…',
  'session.retrying': 'retrying with default camera settings…',
  'session.loadingPose': 'loading the pose model…',
  'session.poseReady': (delegate: string, local: boolean) =>
    `model ready · ${delegate} · models from ${local ? 'this app' : 'the internet'}`,
  'session.loadingBall': 'loading the ball detector…',
  'session.ballReady': (delegate: string) => `ball detector ready · ${delegate}`,
  'session.ballUnavailable': (why: string) => `ball detector unavailable: ${why}`,
  'session.detectorError': (why: string) => `detector error: ${why}`,
  'session.error': (why: string) => `error: ${why}`,
  'session.clipNotOpened': 'the video did not open',
  'session.clipNotLoaded': 'the video did not load',
  'session.noAthlete': 'No athlete in the picture',
  'session.hidden': 'Hip or knee hidden',
  'session.tooFar': 'Athlete too far away',
  'camera.refused':
    'The browser blocks the camera for this site. Allow the camera in the browser’s site settings, then reload the page.',
  'camera.notFound': 'No camera found on this device.',
  'camera.inUse': 'Another app is using the camera. Close that app, then try again.',
  'camera.overconstrained': 'No camera matches the requested settings.',
  'camera.blocked': 'The browser blocked the camera. Serve this page over HTTPS.',
  'camera.aborted': 'The camera did not start. Try again.',
  'camera.insecure':
    'This page is not a secure context, so phones block the camera. Open it over https:// or on localhost. Plain http:// to a LAN address will not work.',
  'camera.noApi':
    'getUserMedia is unavailable in this browser. On a phone this nearly always means the page was loaded over plain http://. Serve it over https://.',
  'pose.runtime': (src: string) =>
    `the pose runtime did not load from ${src}. Make sure that this device reaches the server, then retry.`,
  'pose.server': 'the server',

  'overlay.target': 'Target',
  'overlay.upperTarget': 'Upper target',
  'overlay.lowerTarget': 'Lower target',
  'overlay.parallel': 'Parallel',
  'overlay.rep': (n: number) => `Rep ${n}`,
  'overlay.noRep': 'No-rep',
  'overlay.depth': (percent: string, below: boolean) =>
    `Hips ${percent}% ${below ? 'below' : 'above'} parallel`,
  'overlay.noHit': 'Missed the target',
  'overlay.hitLower': 'Hit the lower target',
  'overlay.ballNotSeen': 'Ball not seen',
  'overlay.ball': 'ball',

  'pair.section': 'Two phones',
  'pair.sectionHint':
    'A second phone in front of the athlete can be the display: it shows the count and calls each rep.',
  'pair.judgeRole': 'This phone is the judge',
  'pair.find': 'Find a display',
  'pair.linkedTo': (name: string) => `Linked to ${name}`,
  'pair.linkingTo': (name: string) => `Linking to ${name}…`,
  'pair.displayRole': 'This phone is the display',
  'pair.displayRoleHint': 'It shows the judge’s count.',
  'pair.open': 'Open',
  'pair.displayLinked': 'Display linked',
  'pair.title': 'Show the count on another phone',
  'pair.searching': 'Looking for displays…',
  'pair.none': 'No display found. Make the other phone the display, and keep it close to this one.',
  'pair.again': 'Look again',
  'pair.unlink': 'Unlink',
  'pair.close': 'Close',
  'pair.silent': 'While a display is linked, this phone stays silent.',
  'pair.waiting': 'Waiting for a judge. On the judging phone, open Settings and tap Find a display.',
  'pair.judgeLinked': 'Judge linked',
  'pair.bluetoothOff': 'Turn Bluetooth on.',
  'pair.notAllowed': 'Allow Nearby devices for this app in the phone’s settings.',
  'pair.cannotAdvertise': 'This phone cannot be a display: it cannot advertise over Bluetooth.',
  'pair.leave': 'Leave the display',

  'sets.title': 'Sets',
  'sets.none': 'No sets yet. With Save sets on, a live set is kept when it stops, if it counted anything.',
  'sets.all': 'All sets',
  'sets.summary': (reps: number, noReps: number, time: string) =>
    `${reps} ${reps === 1 ? 'rep' : 'reps'} · ${noReps} ${noReps === 1 ? 'no-rep' : 'no-reps'} · ${time}`,
  'sets.replay': 'Replay',
  'sets.open': 'Video',
  'sets.delete': 'Delete',
  'sets.confirm': 'Tap again to delete',
  'sets.confirmVideo': 'Tap again to delete it and its video',
  'sets.unreadable': 'The app cannot read the list of sets, so it adds no new set to it.',

  'settings.saveSets': 'Save sets',
  'settings.saveSetsHint':
    'Keeps each live set on this phone, with its counts, time and verdicts. Replaying a video adds no set.',
  'settings.saveVideo': 'Save each live set’s video',
  'settings.saveVideoHint':
    'Saves the camera’s video, without the overlay, in the phone’s Movies folder, about 22 MB a minute. Deleting a set deletes its video.',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.languageHint': 'The app’s text and the spoken count use this language.',
  'settings.deviceLanguage': (name: string) => `Device language (${name})`,
  'settings.say': 'Say twelve',
  'settings.voiceNote':
    'The device’s voice speaks the count. To add a missing voice on Android, open Settings, System, Languages, Text-to-speech output, then install the voice data.',
  'settings.cannotSpeak': 'This browser cannot speak.',
  'settings.noVoice': 'No voice is installed for this language yet.',
  'settings.voice': (name: string, lang: string, otherRegion: boolean, others: number) =>
    `${name} (${lang}) speaks the count${otherRegion ? ', from another region' : ''}.${
      others > 0 ? ` ${others} more ${others === 1 ? 'is' : 'are'} installed for this language.` : ''
    }`,
  'settings.judging': 'Judging',
  'settings.ballCheck': 'Check the ball on the target',
  'settings.ballCheckHint': 'When off, the board judges only the squat.',
  'settings.divisionByHit': 'Pick the athlete’s target from the first hit',
  'settings.divisionByHitHint':
    'In each set, the first throw that hits a target picks the target this athlete must reach.',
  'settings.ballInput': 'Ball model input',
  'settings.pixels': (n: number) => `${n} px`,
  'settings.ballInputHint':
    '416 sees more of the wall around the target, but each frame takes longer. A change applies the next time the board starts.',
  'settings.models': 'Detection models',
  'settings.modelsAsked': (revision: string) =>
    `The page address sets ${revision}, so this choice has no effect.`,
  'settings.modelsShipped': 'They come with the app. A change applies the next time the board starts.',
  'settings.modelsHub':
    'They download from Hugging Face, so the first start needs the internet. For offline use, tap Check this device on the home page.',
  'settings.confidence': 'Pose confidence',
  'settings.confidenceHint':
    'How sure the app must be that it sees an athlete. Raise it if the board counts reps that nobody did. Lower it if the board loses the athlete.',
  'settings.video': 'Video',
  'settings.keepVideo': 'Keep the camera’s video',
  'settings.keepVideoHint': 'When the camera stops, you can save the set’s video.',
  'settings.cannotRecord': 'This browser cannot record video.',
  'settings.about': 'About',
  'settings.version': 'App version',
  'settings.notInstalled': 'not installed',
};

export type Texts = typeof en;

const ptPT: Texts = {
  'title.home': 'Wall Ball Judge',
  'title.judge': 'Painel do juiz | Wall Ball Judge',
  'title.settings': 'Definições | Wall Ball Judge',

  'brand.home': 'Wall Ball Judge, início',
  'nav.judge': 'Painel do juiz',
  'nav.settings': 'Definições',

  'desktop.hint':
    'O browser mostra a app como site para computador, por isso tudo fica pequeno. Num separador do browser com este site, desmarque «Site para computador» no menu. Depois abra a app de novo.',
  'desktop.close': 'Ocultar',

  'home.lede': 'Use o seu dispositivo para avaliar os seus wall balls.',
  'home.demoTitle':
    'Duas estações, vistas de trás. À esquerda, um homem lança para o alvo superior; à direita, uma mulher lança para o alvo inferior. Uma repetição conta quando a anca desce abaixo dos joelhos e depois a bola acerta no alvo do atleta. Um agachamento acima da paralela, ou um lançamento de um homem que só chega ao alvo inferior, é um no rep.',
  'home.ruleDepth': 'Anca abaixo dos joelhos',
  'home.ruleTarget': 'Bola no alvo do atleta',
  'home.demoCaption': 'Os homens lançam para o alvo superior. As mulheres lançam para o alvo inferior.',
  'home.recording': 'Rever um vídeo',
  'home.live': 'Começar',
  'home.settings': 'Definições',
  'home.phone': 'Este dispositivo',
  'home.runs': 'Este dispositivo consegue correr a app?',
  'home.maybe': 'Talvez',
  'home.readySlow': 'A app funciona, mas algumas partes são lentas demais ou não funcionam.',
  'home.readyBad': 'A app não consegue avaliar ao vivo aqui: a câmara ou o modelo de pose não funciona.',
  'home.lastSet': 'Última série',
  'home.offline': 'Pronta a usar sem internet',
  'home.installed': 'Instalada',
  'home.check': 'Testar este dispositivo',
  'home.checkSize':
    'Opcional. Testa a velocidade deste dispositivo e guarda a app para usar sem internet. Transfere cerca de 50 MB.',
  'home.recheck': 'Testar de novo',
  'home.place': 'Como posicionar o dispositivo',
  'home.planLabel':
    'Visto de cima: o dispositivo fica ao lado ou atrás do atleta, e vê o atleta e o alvo. Um dispositivo perto da parede, por baixo do alvo, está mal colocado.',
  'home.planTarget': 'alvo',
  'home.planAthlete': 'atleta',
  'home.planSide': 'ao lado',
  'home.planBehind': 'atrás',
  'home.planClose': 'demasiado perto',
  'home.noteSide': 'Ponha-o ao lado ou atrás do atleta, à altura da anca.',
  'home.notePicture': 'A imagem tem de mostrar a anca, os joelhos e o alvo.',
  'home.noteClose': 'Não o ponha perto da parede ou por baixo do alvo.',
  'home.howTo': 'Como usar',
  'home.howToClose': 'Fechar o vídeo',
  'home.private': 'O vídeo fica no seu dispositivo.',
  'home.contact': 'Contacto',
  'home.github': 'GitHub',
  'home.huggingFace': 'Hugging Face',
  'home.version': (version: string) => `Versão ${version}`,
  'home.yes': 'Sim',
  'home.no': 'Não',
  'home.notYet': 'Ainda não',
  'home.checking': 'A verificar…',
  'home.devServer': 'Indisponível no servidor de desenvolvimento',
  'home.notInBrowser': 'Indisponível neste browser',
  'home.notChecked': 'Por testar',
  'home.notKnown': 'Ainda não se sabe',
  'home.firstSet': 'A primeira série ao vivo mede a velocidade do modelo de pose.',
  'home.frames': (n: number) =>
    `${String(n).replace('.', ',')} ${n === 1 ? 'imagem' : 'imagens'} por segundo`,
  'home.poseModel': (small: boolean, chip: Chip) =>
    `modelo de pose ${small ? 'pequeno' : 'completo'} ${chip === 'GPU' ? 'na GPU' : 'no CPU'}`,
  'home.installIos': 'Para instalar a app, toque em Partilhar e depois em Adicionar ao ecrã principal.',
  'home.installOther':
    'Para instalar a app, abra o menu do browser com os três pontos e toque em Instalar app ou Adicionar ao ecrã principal.',
  'home.install': 'Instalar',
  'home.mayClear': 'O browser pode apagar os modelos quando o dispositivo precisar de espaço.',
  'home.mayClearInstall':
    'O browser pode apagar os modelos quando o dispositivo precisar de espaço. Instale a app para os manter.',
  'home.step': (step: number, of: number, name: string) => `Passo ${step} de ${of}: ${name}`,
  'home.storing': 'A guardar os ficheiros no dispositivo',
  'home.notKept': 'O dispositivo não guardou os ficheiros. Confirme que tem espaço livre e teste de novo.',
  'home.stopped': (why: string) =>
    `O teste parou (${why}). Confirme que o dispositivo tem internet e teste de novo.`,
  'check.pose': 'o modelo de pose',
  'check.ball': 'o detetor da bola',
  'check.target': 'o detetor do alvo',
  'check.speed': 'um teste de velocidade de cada modelo na GPU e no CPU',
  'camera.notHttps': 'Esta página não usa HTTPS, por isso o browser bloqueia a câmara. Pode rever um vídeo.',
  'camera.none': 'Este browser não dá à app nenhuma câmara. Pode rever um vídeo.',

  'board.label': 'Painel do juiz',
  'board.linking': 'A ligar…',
  'board.startCamera': 'Ligar a câmara',
  'board.playRecording': 'Rever um vídeo',
  'board.saveVideo': 'Guardar o último vídeo',
  'board.stop': 'Parar',
  'board.details': 'Toque para ver os detalhes',
  'board.refind': 'Procurar o alvo de novo',
  'board.flip': 'Trocar de câmara',
  'board.go': 'Começar a série',
  'board.find': 'Procurar o alvo',
  'board.targetFaultTitle': 'No reps de alvo. Toque para adicionar um manualmente.',
  'board.moveFaultTitle': 'No reps de agachamento. Toque para adicionar um manualmente.',
  'board.target': 'Alvo',
  'board.squat': 'Agachamento',
  'board.noReps': 'No reps',
  'board.reps': 'Repetições',
  'board.requiredTitle':
    'O alvo destacado é o que este atleta tem de atingir. Toque numa placa quando a bola lhe acertar.',
  'board.upper': 'Superior',
  'board.lower': 'Inferior',
  'board.hitUpper': 'A bola acertou no alvo superior',
  'board.hitLower': 'A bola acertou no alvo inferior',
  'board.timeTitle': 'Do início da primeira repetição ao fim da série',
  'board.time': 'Tempo',
  'board.reset': 'Repor',
  'board.nothingToReset': 'Nada para repor',
  'board.tapToClear': 'Toque de novo para repor',
  'board.pace': (secondsPerRep: string, target: number, at: string | null) =>
    at ? `${secondsPerRep} s por repetição · ${target} em ${at}` : `${secondsPerRep} s por repetição`,
  'board.chip': (model: 'ball' | 'finder' | 'pose', chip: string) =>
    `${{ ball: 'Bola', finder: 'Localizador do alvo', pose: 'Pose' }[model]} ${
      chip === 'GPU' ? 'na GPU' : chip === 'CPU' ? 'no CPU' : `em ${chip}`
    }`,
  'board.recording': 'a gravar',
  'board.starting': 'a iniciar…',
  'board.counting': 'a contar',
  'board.goBanner': 'Já',
  'board.looking': 'à procura do alvo…',
  'board.lookingBanner': 'À procura do alvo',
  'board.searched': (chip: string, seconds: string) =>
    ` · procurado ${chip === 'GPU' ? 'na GPU' : chip === 'CPU' ? 'no CPU' : `em ${chip}`} em ${seconds} s`,
  'board.placed': 'alvo encontrado e colocado',
  'board.placedBanner': 'Alvo colocado',
  'board.oneCandidate': 'um alvo possível, toque nele para o colocar',
  'board.oneCandidateBanner': 'Toque no alvo para o colocar',
  'board.candidates': (n: number) => `${n} alvos possíveis, toque no certo`,
  'board.candidatesBanner': (n: number) => `${n} alvos possíveis: toque num`,
  'board.atSquat': (n: number) =>
    n === 1
      ? 'um alvo possível, colocado quando o atleta agachar por baixo dele, ou toque nele'
      : `${n} alvos possíveis, o primeiro agachamento do atleta escolhe o seu, ou toque num`,
  'board.atSquatBanner': 'Agache-se por baixo do seu alvo',
  'board.picked': 'alvo colocado por cima do atleta, arraste-o para ajustar',
  'board.noTarget': (best: string | null) =>
    `nenhum alvo encontrado${best ? ` (melhor palpite ${best})` : ''}, toque nele no ecrã`,
  'board.noTargetBanner': 'Nenhum alvo encontrado: toque nele',
  'board.finderUnavailable': (why: string) => `localizador do alvo indisponível: ${why}`,
  'board.finderUnavailableBanner': 'Localizador do alvo indisponível',
  'board.placedByTap': 'alvo colocado onde tocou, arraste-o para ajustar',
  'board.placedPick': 'alvo colocado, arraste-o para ajustar',
  'board.untargeted': 'nenhum alvo colocado, a avaliar só a profundidade',
  'board.untargetedBanner': 'Sem alvo: a avaliar só a profundidade',
  'board.failed': (recording: boolean, why: string) => `${recording ? 'o vídeo' : 'a câmara'} falhou: ${why}`,

  'session.opening': 'a abrir a câmara…',
  'session.retrying': 'a tentar de novo com as definições da câmara por omissão…',
  'session.loadingPose': 'a carregar o modelo de pose…',
  'session.poseReady': (delegate: string, local: boolean) =>
    `modelo pronto · ${delegate} · modelos ${local ? 'desta app' : 'da internet'}`,
  'session.loadingBall': 'a carregar o detetor da bola…',
  'session.ballReady': (delegate: string) => `detetor da bola pronto · ${delegate}`,
  'session.ballUnavailable': (why: string) => `detetor da bola indisponível: ${why}`,
  'session.detectorError': (why: string) => `erro do detetor: ${why}`,
  'session.error': (why: string) => `erro: ${why}`,
  'session.clipNotOpened': 'o vídeo não abriu',
  'session.clipNotLoaded': 'o vídeo não carregou',
  'session.noAthlete': 'Nenhum atleta na imagem',
  'session.hidden': 'Anca ou joelho escondido',
  'session.tooFar': 'Atleta demasiado longe',
  'camera.refused':
    'O browser bloqueia a câmara neste site. Permita a câmara nas definições do site no browser e recarregue a página.',
  'camera.notFound': 'Nenhuma câmara encontrada neste dispositivo.',
  'camera.inUse': 'Outra app está a usar a câmara. Feche essa app e tente de novo.',
  'camera.overconstrained': 'Nenhuma câmara corresponde às definições pedidas.',
  'camera.blocked': 'O browser bloqueou a câmara. Sirva esta página por HTTPS.',
  'camera.aborted': 'A câmara não arrancou. Tente de novo.',
  'camera.insecure':
    'Esta página não é um contexto seguro, por isso os telemóveis bloqueiam a câmara. Abra-a por https:// ou em localhost. Um endereço http:// simples na rede local não funciona.',
  'camera.noApi':
    'O getUserMedia não está disponível neste browser. Num telemóvel, isto quase sempre quer dizer que a página foi aberta por http:// simples. Sirva-a por https://.',
  'pose.runtime': (src: string) =>
    `o motor do modelo de pose não carregou de ${src}. Confirme que este dispositivo chega ao servidor e tente de novo.`,
  'pose.server': 'o servidor',

  'overlay.target': 'Alvo',
  'overlay.upperTarget': 'Alvo superior',
  'overlay.lowerTarget': 'Alvo inferior',
  'overlay.parallel': 'Paralela',
  'overlay.rep': (n: number) => `Repetição ${n}`,
  'overlay.noRep': 'No rep',
  'overlay.depth': (percent: string, below: boolean) =>
    `Anca ${percent}% ${below ? 'abaixo' : 'acima'} da paralela`,
  'overlay.noHit': 'Falhou o alvo',
  'overlay.hitLower': 'Acertou no alvo inferior',
  'overlay.ballNotSeen': 'Bola não detetada',
  'overlay.ball': 'bola',

  'pair.section': 'Dois telemóveis',
  'pair.sectionHint':
    'Um segundo telemóvel à frente do atleta pode ser o marcador: mostra a contagem e anuncia cada repetição.',
  'pair.judgeRole': 'Este telemóvel é o juiz',
  'pair.find': 'Procurar marcador',
  'pair.linkedTo': (name: string) => `Ligado a ${name}`,
  'pair.linkingTo': (name: string) => `A ligar a ${name}…`,
  'pair.displayRole': 'Este telemóvel é o marcador',
  'pair.displayRoleHint': 'Mostra a contagem do juiz.',
  'pair.open': 'Abrir',
  'pair.displayLinked': 'Marcador ligado',
  'pair.title': 'Mostrar a contagem noutro telemóvel',
  'pair.searching': 'À procura de marcadores…',
  'pair.none': 'Nenhum marcador encontrado. Faça do outro telemóvel o marcador e mantenha-o perto deste.',
  'pair.again': 'Procurar de novo',
  'pair.unlink': 'Desligar',
  'pair.close': 'Fechar',
  'pair.silent': 'Com um marcador ligado, este telemóvel fica em silêncio.',
  'pair.waiting':
    'À espera de um juiz. No telemóvel do juiz, abra as Definições e toque em Procurar marcador.',
  'pair.judgeLinked': 'Juiz ligado',
  'pair.bluetoothOff': 'Ligue o Bluetooth.',
  'pair.notAllowed': 'Nas definições do telemóvel, dê a esta app a permissão Dispositivos próximos.',
  'pair.cannotAdvertise': 'Este telemóvel não pode ser o marcador: não consegue anunciar-se por Bluetooth.',
  'pair.leave': 'Sair do marcador',

  'sets.title': 'Séries',
  'sets.none':
    'Ainda não há séries. Com Guardar as séries ligado, uma série ao vivo fica guardada quando para, se tiver contado alguma coisa.',
  'sets.all': 'Todas as séries',
  'sets.summary': (reps: number, noReps: number, time: string) =>
    `${reps} ${reps === 1 ? 'repetição' : 'repetições'} · ${noReps} ${noReps === 1 ? 'no rep' : 'no reps'} · ${time}`,
  'sets.replay': 'Rever',
  'sets.open': 'Vídeo',
  'sets.delete': 'Apagar',
  'sets.confirm': 'Toque de novo para apagar',
  'sets.confirmVideo': 'Toque de novo para a apagar com o vídeo',
  'sets.unreadable': 'A app não consegue ler a lista de séries, por isso não lhe adiciona novas séries.',

  'settings.saveSets': 'Guardar as séries',
  'settings.saveSetsHint':
    'Guarda neste telemóvel cada série ao vivo, com as contagens, o tempo e as decisões. Rever um vídeo não guarda nenhuma série.',
  'settings.saveVideo': 'Guardar o vídeo de cada série ao vivo',
  'settings.saveVideoHint':
    'Guarda o vídeo da câmara, sem as marcações, na pasta Movies do telemóvel, cerca de 22 MB por minuto. Apagar uma série apaga o vídeo.',

  'settings.title': 'Definições',
  'settings.language': 'Idioma',
  'settings.languageHint': 'O texto da app e a contagem falada usam este idioma.',
  'settings.deviceLanguage': (name: string) => `Idioma do dispositivo (${name})`,
  'settings.say': 'Dizer doze',
  'settings.voiceNote':
    'A voz do dispositivo diz a contagem. Para adicionar uma voz em falta no Android, abra Definições, Sistema, Idiomas, Saída de texto para voz e instale os dados de voz.',
  'settings.cannotSpeak': 'Este browser não consegue falar.',
  'settings.noVoice': 'Ainda não há nenhuma voz instalada para este idioma.',
  'settings.voice': (name: string, lang: string, otherRegion: boolean, others: number) =>
    `${name} (${lang}) diz a contagem${otherRegion ? ', de outra região' : ''}.${
      others > 0 ? ` Há mais ${others} ${others === 1 ? 'instalada' : 'instaladas'} para este idioma.` : ''
    }`,
  'settings.judging': 'Avaliação',
  'settings.ballCheck': 'Verificar a bola no alvo',
  'settings.ballCheckHint': 'Quando desligado, o painel avalia só o agachamento.',
  'settings.divisionByHit': 'Escolher o alvo do atleta pelo primeiro acerto',
  'settings.divisionByHitHint':
    'Em cada série, o primeiro lançamento que acerta num alvo escolhe o alvo que este atleta tem de atingir.',
  'settings.ballInput': 'Entrada do modelo da bola',
  'settings.pixels': (n: number) => `${n} px`,
  'settings.ballInputHint':
    'Com 416 vê mais da parede à volta do alvo, mas cada imagem demora mais. Uma mudança aplica-se no próximo arranque do painel.',
  'settings.models': 'Modelos de deteção',
  'settings.modelsAsked': (revision: string) =>
    `O endereço da página define ${revision}, por isso esta escolha não tem efeito.`,
  'settings.modelsShipped': 'Vêm com a app. Uma mudança aplica-se no próximo arranque do painel.',
  'settings.modelsHub':
    'São transferidos do Hugging Face, por isso o primeiro arranque precisa de internet. Para usar sem internet, toque em Testar este dispositivo na página inicial.',
  'settings.confidence': 'Confiança da pose',
  'settings.confidenceHint':
    'Quão segura a app tem de estar de que vê um atleta. Suba-a se o painel contar repetições que ninguém fez. Baixe-a se o painel perder o atleta.',
  'settings.video': 'Vídeo',
  'settings.keepVideo': 'Guardar o vídeo da câmara',
  'settings.keepVideoHint': 'Quando a câmara para, pode guardar o vídeo da série.',
  'settings.cannotRecord': 'Este browser não consegue gravar vídeo.',
  'settings.about': 'Sobre',
  'settings.version': 'Versão da app',
  'settings.notInstalled': 'não instalada',
};

const TEXTS: Record<LanguageTag, Texts> = { en, 'pt-PT': ptPT };

/** The language the app's text is in: the settings' choice, or English where no page holds one, as in the tests. */
let active: LanguageTag | null = null;
const current = (): LanguageTag => (active ??= typeof localStorage === 'undefined' ? 'en' : language());

/** The text named `key` in the app's language. A text that takes values comes back as a function of them. */
export function t<K extends keyof Texts>(key: K): Texts[K] {
  return TEXTS[current()][key];
}

const WARNINGS = {
  'no-athlete': 'session.noAthlete',
  hidden: 'session.hidden',
  'too-far': 'session.tooFar',
} as const satisfies Record<Warning, keyof Texts>;

/** The words of the board's warning under the athlete. */
export function warningText(warning: Warning): string {
  return t(WARNINGS[warning]);
}

/** `n` with `digits` decimals, written as the app's language writes numbers. */
export function decimal(n: number, digits: number): string {
  return n.toLocaleString(current(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const isKey = (key: string): key is keyof Texts => key in en;

/** A text for the page's markup: one that takes no values. */
function plain(key: string): string | null {
  if (!isKey(key)) return null;
  const text = t(key);
  return typeof text === 'string' ? text : null;
}

/** The markup's attributes that name a text, and the attribute each one writes. */
const ATTRIBUTES = [
  ['data-i18n-label', 'aria-label'],
  ['data-i18n-title', 'title'],
  ['data-i18n-placeholder', 'placeholder'],
] as const;

/** Writes every text the page's markup names in the app's language. */
export function translatePage(root: ParentNode = document): void {
  document.documentElement.lang = current();
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const text = plain(el.dataset.i18n ?? '');
    if (text !== null) el.textContent = text;
  }
  for (const [data, attribute] of ATTRIBUTES) {
    for (const el of root.querySelectorAll<HTMLElement>(`[${data}]`)) {
      const text = plain(el.getAttribute(data) ?? '');
      if (text !== null) el.setAttribute(attribute, text);
    }
  }
}

const redraws: (() => void)[] = [];

/** Calls `redraw` after each change of language, for text a script wrote rather than the markup holds. */
export function onLanguage(redraw: () => void): void {
  redraws.push(redraw);
}

/**
 * Stores `choice` for the language of the app's text and of the spoken count,
 * and redraws the text that `onLanguage` registered, for an app with no page
 * markup to rewrite.
 */
export function chooseLanguage(choice: LanguageChoice): void {
  setLanguage(choice);
  active = language();
  for (const redraw of redraws) redraw();
}

/** Stores `choice` for the language of the app's text and of the spoken count, and rewrites the page in it. */
export function changeLanguage(choice: LanguageChoice): void {
  setLanguage(choice);
  active = language();
  translatePage();
  for (const redraw of redraws) redraw();
}
