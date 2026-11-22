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

  'home.lede': 'Train your wall balls with your device as the judge.',
  'home.demoTitle':
    "Two stations, seen from behind. On the left a man throws to the men's target, and on the right a woman throws to the women's target. A rep counts when the hips go below the knees and the ball then hits the athlete's target. A squat above parallel, or a man's throw that reaches only the women's target, is a no-rep.",
  'home.ruleDepth': 'Hips below the knees',
  'home.ruleTarget': 'Ball on the athlete’s target',
  'home.recording': 'Replay a video',
  'home.live': 'Set up',
  'home.settings': 'Settings',
  'home.phone': 'This device',
  'home.runs': 'Can this device run the app?',
  'home.maybe': 'Maybe',
  'home.readySlow': 'The app judges, but some of its parts run too slowly or do not run.',
  'home.readyBad': 'The app cannot judge live here: the camera or the pose does not run.',
  'home.lastSet': 'Last set',
  'home.offline': 'Ready for offline use',
  'home.installed': 'Installed',
  'home.check': 'Check this device',
  'home.checkSize': 'Downloads about 50 MB, then times the models on the GPU and the CPU',
  'home.recheck': 'Check again',
  'home.place': 'How to position the device',
  'home.planLabel':
    "Seen from above: the phone stands at the athlete's side or behind the athlete, and sees the athlete and the target. A phone close to the wall under the target is wrong.",
  'home.planTarget': 'target',
  'home.planAthlete': 'athlete',
  'home.planSide': 'at the side',
  'home.planBehind': 'behind',
  'home.planClose': 'too close',
  'home.noteSide': "Stand it at the athlete's side or behind them, at hip height.",
  'home.notePicture': 'The picture must show the hips, the knees and the target.',
  'home.noteClose': 'Do not put it close under the target.',
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
  'home.firstSet': 'The first set measures the pose.',
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
    `The check stopped (${why}). Make sure that the device has a network, then check again.`,
  'check.pose': 'the pose model',
  'check.ball': 'the ball detector',
  'check.target': 'the target detector',
  'check.speed': 'a speed test of each model on the GPU and the CPU',
  'camera.notHttps':
    'This page is not on HTTPS, so the browser blocks the camera. You can judge a recording.',
  'camera.none': 'This browser gives the app no camera. You can judge a recording.',

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
  'board.find': 'Find target',
  'board.targetFaultTitle': 'A target no-rep. Tap to add one by hand.',
  'board.moveFaultTitle': 'A squat no-rep. Tap to add one by hand.',
  'board.target': 'Target',
  'board.squat': 'Squat',
  'board.noReps': 'No-reps',
  'board.reps': 'Reps',
  'board.divisionTitle':
    'The highlighted division is the target this athlete must reach. Tap a plate when the ball hit it.',
  'board.men': 'Men',
  'board.women': 'Women',
  'board.hitMen': "The ball hit the men's target",
  'board.hitWomen': "The ball hit the women's target",
  'board.timeTitle': 'From the start of the first rep to the end of the set',
  'board.time': 'Time',
  'board.reset': 'Reset',
  'board.nothingToReset': 'Nothing to reset',
  'board.tapToClear': 'Tap again to clear',
  'board.pace': (secondsPerRep: string, target: number, at: string | null) =>
    at ? `${secondsPerRep} s a rep · ${target} at ${at}` : `${secondsPerRep} s a rep`,
  'board.chip': (model: 'ball' | 'finder' | 'pose', chip: string) =>
    `${{ ball: 'Ball', finder: 'Target finder', pose: 'Pose' }[model]} on ${chip}`,
  'board.notCounting': 'Not counting yet',
  'board.judging': (women: boolean) => `Judging the ${women ? "women's" : "men's"} target`,
  'board.judgingTarget': 'Judging the target',
  'board.depthOnly': 'Judging depth only',
  'board.recording': 'recording',
  'board.starting': 'starting...',
  'board.counting': 'counting',
  'board.goBanner': 'Go',
  'board.looking': 'looking for the target...',
  'board.lookingBanner': 'Looking for the target',
  'board.searched': (chip: string, seconds: string) => ` · searched on the ${chip} in ${seconds} s`,
  'board.placed': 'target found and placed',
  'board.placedBanner': 'Target placed',
  'board.oneCandidate': 'one possible target, tap it to place it',
  'board.oneCandidateBanner': 'Tap the target to place it',
  'board.candidates': (n: number) => `${n} possible targets, tap the right one`,
  'board.candidatesBanner': (n: number) => `${n} possible targets: tap one`,
  'board.noTarget': (best: string | null) =>
    `no target found${best ? ` (best guess ${best})` : ''}, tap it on the screen`,
  'board.noTargetBanner': 'No target found: tap it',
  'board.finderUnavailable': (why: string) => `target finder unavailable: ${why}`,
  'board.finderUnavailableBanner': 'Target finder unavailable',
  'board.placedByTap': 'target placed where you tapped, drag a line to adjust',
  'board.placedPick': 'target placed, drag a line to adjust',
  'board.failed': (recording: boolean, why: string) =>
    `${recording ? 'the recording' : 'camera'} failed: ${why}`,

  'session.opening': 'opening the camera...',
  'session.retrying': 'retrying with default camera settings...',
  'session.loadingPose': 'loading the pose model...',
  'session.poseReady': (delegate: string, local: boolean) =>
    `model ready · ${delegate} · models from ${local ? 'this app' : 'the network'}`,
  'session.loadingBall': 'loading the ball detector...',
  'session.ballReady': (delegate: string) => `ball detector ready · ${delegate}`,
  'session.ballUnavailable': (why: string) => `ball detector unavailable: ${why}`,
  'session.detectorError': (why: string) => `detector error: ${why}`,
  'session.error': (why: string) => `error: ${why}`,
  'session.clipNotOpened': 'the clip did not open',
  'session.clipNotLoaded': 'the clip did not load',
  'session.noAthlete': 'No athlete in the picture',
  'session.hidden': 'Hip or knee hidden',
  'session.tooFar': 'Athlete too far away',
  'camera.refused': 'Camera permission was refused. Allow it in the browser site settings, then reload.',
  'camera.notFound': 'No camera found on this device.',
  'camera.inUse': 'The camera is already in use by another app. Close it and retry.',
  'camera.overconstrained': 'No camera matches the requested settings.',
  'camera.blocked': 'The browser blocked the camera. Serve this page over HTTPS.',
  'camera.aborted': 'The camera failed to start. Retry.',
  'camera.insecure':
    'This page is not a secure context, so phones block the camera. Open it over https:// or on localhost. Plain http:// to a LAN address will not work.',
  'camera.noApi':
    'getUserMedia is unavailable in this browser. On a phone this nearly always means the page was loaded over plain http://. Serve it over https://.',
  'pose.runtime': (src: string) =>
    `the pose runtime did not load from ${src}. Make sure that this device reaches the server, then retry.`,
  'pose.server': 'the server',

  'overlay.target': 'Target',
  'overlay.mensTarget': "Men's target",
  'overlay.womensTarget': "Women's target",
  'overlay.dragToMove': (name: string) => `${name}, drag to move`,
  'overlay.parallel': 'Parallel',
  'overlay.rep': (n: number) => `Rep ${n}`,
  'overlay.noRep': 'No rep',
  'overlay.depth': (percent: string, below: boolean) =>
    `Hips ${percent}% ${below ? 'below' : 'above'} parallel`,
  'overlay.noHit': 'No hit on the target',
  'overlay.hitWomens': "Hit the women's target",
  'overlay.ballNotSeen': 'Ball not seen',
  'overlay.ball': 'ball',

  'pair.section': 'Two phones',
  'pair.sectionHint':
    'With two phones, one judges from the side or behind, and the other stands in front of the athlete, shows the count and calls each rep.',
  'pair.judgeRole': 'This phone judges',
  'pair.find': 'Find a display',
  'pair.linkedTo': (name: string) => `Linked to ${name}`,
  'pair.displayRole': 'This phone is the display',
  'pair.displayRoleHint': 'It shows the count that a judging phone sends, and calls each rep.',
  'pair.open': 'Open',
  'pair.displayLinked': 'Display linked',
  'pair.title': 'Show the count on another phone',
  'pair.searching': 'Looking for displays…',
  'pair.none': 'No display found. Open Display on the other phone, close to this one.',
  'pair.again': 'Look again',
  'pair.unlink': 'Unlink',
  'pair.close': 'Close',
  'pair.silent': 'While a display is linked, it calls the reps and this phone stays silent.',
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
  'sets.unreadable': 'The list of sets cannot be read, so no set is added to it.',

  'settings.saveSets': 'Save sets',
  'settings.saveSetsHint':
    'Keeps each live set that counted anything on this phone when it ends: its counts, its time and its verdicts. A judged video is never kept.',
  'settings.saveVideo': 'Save each live set’s video',
  'settings.saveVideoHint':
    'The camera’s video, without the overlay, goes to the phone’s Movies folder, about 22 MB a minute. Deleting the set deletes its video.',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.languageHint': 'The app’s text and the spoken count use this language.',
  'settings.deviceLanguage': (name: string) => `Device language (${name})`,
  'settings.say': 'Say twelve',
  'settings.voiceNote':
    'The phone’s own speech engine speaks the count. On Android, install a missing voice under Settings, System, Languages, Text-to-speech output, Google engine, Install voice data.',
  'settings.cannotSpeak': 'This browser cannot speak.',
  'settings.noVoice': 'No voice is installed for this language yet.',
  'settings.voice': (name: string, lang: string, otherRegion: boolean, others: number) =>
    `${name} (${lang}) speaks the count${otherRegion ? ', from another region' : ''}.${
      others > 0 ? ` ${others} more ${others === 1 ? 'is' : 'are'} installed for this language.` : ''
    }`,
  'settings.judging': 'Judging',
  'settings.ballCheck': 'Check the ball on the target',
  'settings.ballCheckOff': 'Off, the board judges the squat alone.',
  'settings.ballInput': 'Ball model input',
  'settings.pixels': (n: number) => `${n} px`,
  'settings.ballInputHint':
    'The ball check reads a square of this many pixels around the target, at the scale of the training frames. At 416 it reads more of the frame around the target, and it needs more time for each frame it checks. A change applies at the board’s next start.',
  'settings.models': 'Detection models',
  'settings.modelsAsked': (revision: string) =>
    `This page's address asks for ${revision}, which takes the place of this choice.`,
  'settings.modelsShipped': 'These ship with the app. A change applies at the board’s next start.',
  'settings.modelsHub':
    'These come from the Hugging Face Hub, so the first start needs a network. Check this device on the home view to keep them for use with no network.',
  'settings.confidence': 'Pose confidence',
  'settings.confidenceHint':
    'How sure the pose model must be before it draws a skeleton. Raise it when the board counts reps that nobody did, as when somebody walks into the picture. Lower it when the board loses an athlete who is plainly there.',
  'settings.video': 'Video',
  'settings.keepVideo': 'Keep the camera’s video',
  'settings.keepVideoHint': 'When the camera stops, the board can save the set’s video.',
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

  'home.lede': 'Treine os wall balls com o seu dispositivo como juiz.',
  'home.demoTitle':
    'Duas estações, vistas de trás. À esquerda, um homem lança para o alvo dos homens; à direita, uma mulher lança para o alvo das mulheres. Uma repetição conta quando a anca desce abaixo dos joelhos e a bola acerta depois no alvo do atleta. Um agachamento acima do paralelo, ou um lançamento de um homem que só chega ao alvo das mulheres, é um no rep.',
  'home.ruleDepth': 'Anca abaixo dos joelhos',
  'home.ruleTarget': 'Bola no alvo do atleta',
  'home.recording': 'Rever um vídeo',
  'home.live': 'Preparar',
  'home.settings': 'Definições',
  'home.phone': 'Este dispositivo',
  'home.runs': 'Este dispositivo consegue correr a app?',
  'home.maybe': 'Talvez',
  'home.readySlow': 'A app julga, mas algumas partes correm devagar demais ou não correm.',
  'home.readyBad': 'A app não consegue julgar ao vivo aqui: a câmara ou a pose não correm.',
  'home.lastSet': 'Última série',
  'home.offline': 'Pronta a usar sem rede',
  'home.installed': 'Instalada',
  'home.check': 'Testar este dispositivo',
  'home.checkSize': 'Transfere cerca de 50 MB e mede os modelos na GPU e no CPU',
  'home.recheck': 'Testar de novo',
  'home.place': 'Como posicionar o dispositivo',
  'home.planLabel':
    'Visto de cima: o telemóvel fica ao lado ou atrás do atleta, e vê o atleta e o alvo. Um telemóvel perto da parede, por baixo do alvo, está mal colocado.',
  'home.planTarget': 'alvo',
  'home.planAthlete': 'atleta',
  'home.planSide': 'ao lado',
  'home.planBehind': 'atrás',
  'home.planClose': 'demasiado perto',
  'home.noteSide': 'Ponha-o ao lado ou atrás do atleta, à altura da anca.',
  'home.notePicture': 'A imagem tem de mostrar a anca, os joelhos e o alvo.',
  'home.noteClose': 'Não o ponha perto da parede, por baixo do alvo.',
  'home.private': 'O vídeo fica no seu dispositivo.',
  'home.contact': 'Contacto',
  'home.github': 'GitHub',
  'home.huggingFace': 'Hugging Face',
  'home.version': (version: string) => `Versão ${version}`,
  'home.yes': 'Sim',
  'home.no': 'Não',
  'home.notYet': 'Ainda não',
  'home.checking': 'A verificar…',
  'home.devServer': 'Não no servidor de desenvolvimento',
  'home.notInBrowser': 'Não neste browser',
  'home.notChecked': 'Por testar',
  'home.notKnown': 'Ainda não se sabe',
  'home.firstSet': 'A primeira série mede a pose.',
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
    `O teste parou (${why}). Confirme que o dispositivo tem rede e teste de novo.`,
  'check.pose': 'o modelo de pose',
  'check.ball': 'o detetor da bola',
  'check.target': 'o detetor do alvo',
  'check.speed': 'um teste de velocidade de cada modelo na GPU e no CPU',
  'camera.notHttps':
    'Esta página não usa HTTPS, por isso o browser bloqueia a câmara. Pode julgar uma gravação.',
  'camera.none': 'Este browser não dá à app nenhuma câmara. Pode julgar uma gravação.',

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
  'board.targetFaultTitle': 'Um no rep de alvo. Toque para juntar um à mão.',
  'board.moveFaultTitle': 'Um no rep de agachamento. Toque para juntar um à mão.',
  'board.target': 'Alvo',
  'board.squat': 'Agachamento',
  'board.noReps': 'Nulas',
  'board.reps': 'Repetições',
  'board.divisionTitle':
    'A divisão destacada é o alvo que este atleta tem de atingir. Toque numa placa quando a bola lhe acertar.',
  'board.men': 'Homens',
  'board.women': 'Mulheres',
  'board.hitMen': 'A bola acertou no alvo dos homens',
  'board.hitWomen': 'A bola acertou no alvo das mulheres',
  'board.timeTitle': 'Do início da primeira repetição ao fim da série',
  'board.time': 'Tempo',
  'board.reset': 'Repor',
  'board.nothingToReset': 'Nada para repor',
  'board.tapToClear': 'Toque de novo para limpar',
  'board.pace': (secondsPerRep: string, target: number, at: string | null) =>
    at ? `${secondsPerRep} s por repetição · ${target} em ${at}` : `${secondsPerRep} s por repetição`,
  'board.chip': (model: 'ball' | 'finder' | 'pose', chip: string) =>
    `${{ ball: 'Bola', finder: 'Localizador do alvo', pose: 'Pose' }[model]} ${
      chip === 'GPU' ? 'na GPU' : chip === 'CPU' ? 'no CPU' : `em ${chip}`
    }`,
  'board.notCounting': 'Ainda sem contar',
  'board.judging': (women: boolean) => `A julgar o alvo ${women ? 'das mulheres' : 'dos homens'}`,
  'board.judgingTarget': 'A julgar o alvo',
  'board.depthOnly': 'A julgar só a profundidade',
  'board.recording': 'a gravar',
  'board.starting': 'a iniciar...',
  'board.counting': 'a contar',
  'board.goBanner': 'Já',
  'board.looking': 'à procura do alvo...',
  'board.lookingBanner': 'À procura do alvo',
  'board.searched': (chip: string, seconds: string) =>
    ` · procurado ${chip === 'GPU' ? 'na GPU' : chip === 'CPU' ? 'no CPU' : `em ${chip}`} em ${seconds} s`,
  'board.placed': 'alvo encontrado e colocado',
  'board.placedBanner': 'Alvo colocado',
  'board.oneCandidate': 'um alvo possível, toque nele para o colocar',
  'board.oneCandidateBanner': 'Toque no alvo para o colocar',
  'board.candidates': (n: number) => `${n} alvos possíveis, toque no certo`,
  'board.candidatesBanner': (n: number) => `${n} alvos possíveis: toque num`,
  'board.noTarget': (best: string | null) =>
    `nenhum alvo encontrado${best ? ` (melhor palpite ${best})` : ''}, toque nele no ecrã`,
  'board.noTargetBanner': 'Nenhum alvo encontrado: toque nele',
  'board.finderUnavailable': (why: string) => `localizador do alvo indisponível: ${why}`,
  'board.finderUnavailableBanner': 'Localizador do alvo indisponível',
  'board.placedByTap': 'alvo colocado onde tocou, arraste uma linha para ajustar',
  'board.placedPick': 'alvo colocado, arraste uma linha para ajustar',
  'board.failed': (recording: boolean, why: string) =>
    `${recording ? 'a gravação' : 'a câmara'} falhou: ${why}`,

  'session.opening': 'a abrir a câmara...',
  'session.retrying': 'a tentar de novo com as definições da câmara por omissão...',
  'session.loadingPose': 'a carregar o modelo de pose...',
  'session.poseReady': (delegate: string, local: boolean) =>
    `modelo pronto · ${delegate} · modelos ${local ? 'desta app' : 'da rede'}`,
  'session.loadingBall': 'a carregar o detetor da bola...',
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
    'A permissão da câmara foi recusada. Permita-a nas definições do site no browser e recarregue.',
  'camera.notFound': 'Nenhuma câmara encontrada neste aparelho.',
  'camera.inUse': 'A câmara já está a ser usada por outra app. Feche-a e tente de novo.',
  'camera.overconstrained': 'Nenhuma câmara corresponde às definições pedidas.',
  'camera.blocked': 'O browser bloqueou a câmara. Sirva esta página por HTTPS.',
  'camera.aborted': 'A câmara não arrancou. Tente de novo.',
  'camera.insecure':
    'Esta página não é um contexto seguro, por isso os telemóveis bloqueiam a câmara. Abra-a por https:// ou em localhost. Um endereço http:// simples na rede local não funciona.',
  'camera.noApi':
    'O getUserMedia não está disponível neste browser. Num telemóvel, isto quase sempre quer dizer que a página foi aberta por http:// simples. Sirva-a por https://.',
  'pose.runtime': (src: string) =>
    `o motor do modelo de pose não carregou de ${src}. Confirme que este aparelho chega ao servidor e tente de novo.`,
  'pose.server': 'o servidor',

  'overlay.target': 'Alvo',
  'overlay.mensTarget': 'Alvo dos homens',
  'overlay.womensTarget': 'Alvo das mulheres',
  'overlay.dragToMove': (name: string) => `${name}, arraste para mover`,
  'overlay.parallel': 'Paralela',
  'overlay.rep': (n: number) => `Repetição ${n}`,
  'overlay.noRep': 'No rep',
  'overlay.depth': (percent: string, below: boolean) =>
    `Anca ${percent}% ${below ? 'abaixo' : 'acima'} do paralelo`,
  'overlay.noHit': 'Não acertou no alvo',
  'overlay.hitWomens': 'Acertou no alvo das mulheres',
  'overlay.ballNotSeen': 'Bola não vista',
  'overlay.ball': 'bola',

  'pair.section': 'Dois telemóveis',
  'pair.sectionHint':
    'Com dois telemóveis, um julga de lado ou por trás, e o outro fica à frente do atleta, mostra a contagem e anuncia cada repetição.',
  'pair.judgeRole': 'Este telemóvel julga',
  'pair.find': 'Procurar um ecrã',
  'pair.linkedTo': (name: string) => `Ligado a ${name}`,
  'pair.displayRole': 'Este telemóvel é o ecrã',
  'pair.displayRoleHint': 'Mostra a contagem que um telemóvel que julga envia, e anuncia cada repetição.',
  'pair.open': 'Abrir',
  'pair.displayLinked': 'Ecrã ligado',
  'pair.title': 'Mostrar a contagem noutro telemóvel',
  'pair.searching': 'À procura de ecrãs…',
  'pair.none': 'Nenhum ecrã encontrado. Abra Ecrã no outro telemóvel, perto deste.',
  'pair.again': 'Procurar de novo',
  'pair.unlink': 'Desligar',
  'pair.close': 'Fechar',
  'pair.silent': 'Com um ecrã ligado, é o ecrã que anuncia as repetições e este telemóvel fica em silêncio.',
  'pair.waiting':
    'À espera de um juiz. No telemóvel que julga, abra as Definições e toque em Procurar um ecrã.',
  'pair.judgeLinked': 'Juiz ligado',
  'pair.bluetoothOff': 'Ligue o Bluetooth.',
  'pair.notAllowed': 'Permita Dispositivos próximos a esta app nas definições do telemóvel.',
  'pair.cannotAdvertise': 'Este telemóvel não pode ser ecrã: não consegue anunciar-se por Bluetooth.',
  'pair.leave': 'Sair do ecrã',

  'sets.title': 'Séries',
  'sets.none':
    'Ainda não há séries. Com Guardar as séries ligado, uma série ao vivo fica guardada quando para, se tiver contado alguma coisa.',
  'sets.all': 'Todas as séries',
  'sets.summary': (reps: number, noReps: number, time: string) =>
    `${reps} ${reps === 1 ? 'repetição' : 'repetições'} · ${noReps} ${noReps === 1 ? 'nula' : 'nulas'} · ${time}`,
  'sets.replay': 'Rever',
  'sets.open': 'Vídeo',
  'sets.delete': 'Apagar',
  'sets.confirm': 'Toque de novo para apagar',
  'sets.confirmVideo': 'Toque de novo para a apagar com o vídeo',
  'sets.unreadable': 'A lista de séries não pode ser lida, por isso nenhuma série lhe é acrescentada.',

  'settings.saveSets': 'Guardar as séries',
  'settings.saveSetsHint':
    'Guarda neste telemóvel cada série ao vivo que contou alguma coisa, quando termina: as contagens, o tempo e as decisões. Um vídeo julgado nunca fica guardado.',
  'settings.saveVideo': 'Guardar o vídeo de cada série ao vivo',
  'settings.saveVideoHint':
    'O vídeo da câmara, sem as marcações, vai para a pasta Movies do telemóvel, cerca de 22 MB por minuto. Apagar a série apaga o vídeo.',

  'settings.title': 'Definições',
  'settings.language': 'Idioma',
  'settings.languageHint': 'O texto da app e a contagem falada usam este idioma.',
  'settings.deviceLanguage': (name: string) => `Idioma do dispositivo (${name})`,
  'settings.say': 'Dizer doze',
  'settings.voiceNote':
    'O motor de voz do próprio telemóvel diz a contagem. No Android, instale uma voz em falta em Definições, Sistema, Idiomas, Saída de texto para voz, motor da Google, Instalar dados de voz.',
  'settings.cannotSpeak': 'Este browser não consegue falar.',
  'settings.noVoice': 'Ainda não há nenhuma voz instalada para este idioma.',
  'settings.voice': (name: string, lang: string, otherRegion: boolean, others: number) =>
    `${name} (${lang}) diz a contagem${otherRegion ? ', de outra região' : ''}.${
      others > 0 ? ` Há mais ${others} ${others === 1 ? 'instalada' : 'instaladas'} para este idioma.` : ''
    }`,
  'settings.judging': 'Julgamento',
  'settings.ballCheck': 'Verificar a bola no alvo',
  'settings.ballCheckOff': 'Desligado, o painel julga só o agachamento.',
  'settings.ballInput': 'Entrada do modelo da bola',
  'settings.pixels': (n: number) => `${n} px`,
  'settings.ballInputHint':
    'A verificação da bola lê um quadrado com este número de píxeis à volta do alvo, à escala das imagens de treino. Com 416 lê mais da imagem à volta do alvo e precisa de mais tempo para cada imagem que verifica. Uma mudança aplica-se no próximo arranque do painel.',
  'settings.models': 'Modelos de deteção',
  'settings.modelsAsked': (revision: string) =>
    `O endereço desta página pede ${revision}, que toma o lugar desta escolha.`,
  'settings.modelsShipped': 'Estes vêm com a app. Uma mudança aplica-se no próximo arranque do painel.',
  'settings.modelsHub':
    'Estes vêm do Hugging Face Hub, por isso o primeiro arranque precisa de rede. Teste este dispositivo no início para os manter para uso sem rede.',
  'settings.confidence': 'Confiança da pose',
  'settings.confidenceHint':
    'Quão seguro o modelo de pose tem de estar antes de desenhar um esqueleto. Suba-a quando o painel conta repetições que ninguém fez, como quando alguém entra na imagem. Baixe-a quando o painel perde um atleta que está claramente lá.',
  'settings.video': 'Vídeo',
  'settings.keepVideo': 'Guardar o vídeo da câmara',
  'settings.keepVideoHint': 'Quando a câmara para, o painel pode guardar o vídeo da série.',
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
