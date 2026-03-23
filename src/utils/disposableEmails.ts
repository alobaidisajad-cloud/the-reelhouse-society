/**
 * Disposable / throwaway email domain blocklist.
 * Blocks temp-mail services so only permanent addresses can register.
 * Maintained alphabetically for easy auditing.
 */
const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  // ── A ──
  '10minutemail.com', '20minutemail.com', '33mail.com',
  'adf.ly', 'airmail.cc', 'anonaddy.com', 'anonymbox.com',
  // ── B ──
  'bugmenot.com', 'burnermail.io', 'byom.de',
  // ── C ──
  'clan.sx', 'cock.li', 'crazymailing.com',
  // ── D ──
  'deadaddress.com', 'discard.email', 'discardmail.com',
  'dispostable.com', 'drdrb.net', 'dropmail.me',
  // ── E ──
  'emailfake.com', 'emailondeck.com', 'emailsecurite.com',
  'emailtemporario.com.br', 'emkei.cz',
  // ── F ──
  'fakeinbox.com', 'fakemailgenerator.com', 'filzmail.com',
  'fivemail.de', 'flyspam.com',
  // ── G ──
  'getnada.com', 'getonemail.com', 'grr.la',
  'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info',
  'guerrillamail.net', 'guerrillamailblock.com',
  // ── H ──
  'harakirimail.com', 'hidemail.de', 'hot-mail.cf',
  'hot-mail.ga', 'hot-mail.gq', 'hot-mail.ml',
  'hot-mail.tk',
  // ── I ──
  'imgof.com', 'inboxbear.com', 'inboxkitten.com',
  'incognitomail.com', 'incognitomail.org',
  // ── J ──
  'jetable.com', 'jetable.fr.nf', 'jetable.net',
  'jetable.org', 'jnxjn.com', 'jourrapide.com',
  // ── K ──
  'kasmail.com', 'koszmail.pl',
  // ── L ──
  'lhsdv.com', 'linuxmail.so', 'litedrop.com',
  'lroid.com', 'lru.me',
  // ── M ──
  'mailcatch.com', 'maildrop.cc', 'mailexpire.com',
  'mailfence.com', 'mailforspam.com', 'mailhazard.com',
  'mailhazard.us', 'mailinater.com', 'mailinator.com',
  'mailinator.net', 'mailinator2.com', 'mailincubator.com',
  'mailismagic.com', 'mailmate.com', 'mailmoat.com',
  'mailnator.com', 'mailnesia.com', 'mailnull.com',
  'mailpoof.com', 'mailsac.com', 'mailshell.com',
  'mailsiphon.com', 'mailslurp.com', 'mailtemp.info',
  'mailtothis.com', 'mailzilla.com', 'meltmail.com',
  'mintemail.com', 'mobi.web.id', 'mohmal.com',
  'mt2015.com', 'mx0.wwwnew.eu', 'mytemp.email',
  'mytrashmail.com',
  // ── N ──
  'nobulk.com', 'nospam.ze.tc', 'notmailinator.com',
  'notsharingmy.info', 'nowmymail.com',
  // ── O ──
  'objectmail.com', 'obobbo.com', 'odaymail.com',
  'one-time.email', 'otherinbox.com',
  // ── P ──
  'pookmail.com', 'proxymail.eu', 'putthisinyouremail.com',
  // ── Q ──
  'qq.com',
  // ── R ──
  'recode.me', 'regbypass.com', 'rmqkr.net',
  'royal.net', 'rtrtr.com',
  // ── S ──
  'sharklasers.com', 'shieldedmail.com', 'sify.com',
  'singlebrooke.com', 'slipry.net', 'slopsbox.com',
  'smashmail.de', 'spamavert.com', 'spambob.com',
  'spambob.net', 'spambog.com', 'spambox.us',
  'spamcero.com', 'spamcorptastic.com', 'spamcowboy.com',
  'spamcowboy.net', 'spamdecoy.net', 'spamex.com',
  'spamfighter.cf', 'spamfighter.ga', 'spamfighter.gq',
  'spamfighter.ml', 'spamfighter.tk', 'spamfree24.com',
  'spamfree24.de', 'spamfree24.eu', 'spamfree24.info',
  'spamfree24.net', 'spamfree24.org', 'spamgourmet.com',
  'spamhole.com', 'spamify.com', 'spaminator.de',
  'spamkill.info', 'spaml.com', 'spaml.de',
  'spammotel.com', 'spamobox.com', 'spamoff.de',
  'spamslicer.com', 'spamspot.com', 'spamstack.net',
  'spamthis.co.uk', 'spamtrail.com', 'spamtrap.ro',
  'speed.1s.fr', 'superrito.com',
  // ── T ──
  'temp-mail.org', 'temp-mail.ru', 'tempail.com',
  'tempalias.com', 'tempe4mail.com', 'tempemail.co.za',
  'tempemail.net', 'tempinbox.com', 'tempmail.com',
  'tempmail.de', 'tempmail.eu', 'tempmail.it',
  'tempmail.net', 'tempmail2.com', 'tempmaildemo.com',
  'tempmailer.com', 'tempmailid.com', 'tempomail.fr',
  'temporaryemail.net', 'temporaryemail.us',
  'temporaryforwarding.com', 'temporaryinbox.com',
  'temporarymailaddress.com', 'thanksnospam.info',
  'thankyou2010.com', 'throwam.com', 'throwawayemailaddress.com',
  'tmail.ws', 'tmails.net', 'tmpmail.net',
  'tmpmail.org', 'tradermail.info', 'trash-mail.at',
  'trash-mail.com', 'trash-mail.de', 'trash2009.com',
  'trashdevil.com', 'trashdevil.de', 'trashemail.de',
  'trashmail.at', 'trashmail.com', 'trashmail.de',
  'trashmail.io', 'trashmail.me', 'trashmail.net',
  'trashmail.org', 'trashmail.ws', 'trashmailer.com',
  'trashymail.com', 'trashymail.net', 'trbvm.com',
  'trbvn.com', 'trialmail.de', 'trickmail.net',
  'turual.com',
  // ── U ──
  'uggsrock.com', 'umail.net', 'upliftnow.com',
  'uplipht.com', 'urhen.com',
  // ── V ──
  'veryreallyelongated.com', 'viditag.com', 'viewcastmedia.com',
  'viewcastmedia.net', 'viewcastmedia.org',
  // ── W ──
  'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
  'wetrainbayarea.com', 'wetrainbayarea.org',
  'wh4f.org', 'whatiaas.com', 'whatpaas.com',
  'whyspam.me', 'willhackforfood.biz', 'willselfdestruct.com',
  'wuzupmail.net',
  // ── X ──
  'xagloo.com', 'xemaps.com', 'xents.com',
  'xjoi.com', 'xoxy.net',
  // ── Y ──
  'yep.it', 'yogamaven.com', 'yomail.info',
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'yourdomain.com', 'ypmail.webarnak.fr.eu.org',
  // ── Z ──
  'zehnminutenmail.de', 'zippymail.info', 'zoaxe.com',
  'zoemail.org',
])

/**
 * Returns `true` if the email belongs to a known disposable / throwaway provider.
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim()
  if (!domain) return false
  return DISPOSABLE_DOMAINS.has(domain)
}

/**
 * Basic structural email validation (covers most real-world typos).
 * This is NOT a substitute for server-side verification — just a UX guard.
 */
export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}
