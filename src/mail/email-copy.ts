// Localized copy for the three per-user transactional emails (invite, password
// reset, sign-in code). One entry per supported language; the mail service
// resolves the user's language (see resolveMailLang) and picks the matching
// builder. Keeping all translations here keeps mail.service.ts lean and makes
// the wording reviewable in one place.

export type MailLang =
  | "sv"
  | "en"
  | "nb"
  | "pl"
  | "et"
  | "uk"
  | "ru"
  | "fi"
  | "lt"
  | "lv"
  | "bs";

export const MAIL_LANGS: MailLang[] = [
  "sv",
  "en",
  "nb",
  "pl",
  "et",
  "uk",
  "ru",
  "fi",
  "lt",
  "lv",
  "bs",
];

// Word used in the greeting when we don't have the user's name ("Hi there").
export const GREETING_FALLBACK: Record<MailLang, string> = {
  sv: "där",
  nb: "der",
  en: "there",
  pl: "użytkowniku",
  et: "kasutaja",
  uk: "користувачу",
  ru: "пользователь",
  fi: "käyttäjä",
  lt: "naudotojau",
  lv: "lietotāj",
  bs: "korisniče",
};

export type InviteCopy = {
  subject: string;
  hi: string;
  invited: string;
  open: string;
  link: string;
  later: string;
  expires: string;
};

export const inviteCopy: Record<
  MailLang,
  (vars: { name: string; roleLabel: string }) => InviteCopy
> = {
  sv: ({ name, roleLabel }) => ({
    subject: "Din inbjudan till ByggExp",
    hi: `Hej ${name},`,
    invited: `Du har blivit inbjuden till ByggExp som ${roleLabel}.`,
    open: "Öppna länken nedan för att bekräfta din e-post och skapa ett lösenord:",
    link: "Bekräfta e-post och skapa lösenord",
    later:
      "Du kan också logga in senare med din e-post — begär en engångskod i appen.",
    expires: "Denna länk går ut om 7 dagar.",
  }),
  nb: ({ name, roleLabel }) => ({
    subject: "Din invitasjon til ByggExp",
    hi: `Hei ${name},`,
    invited: `Du har blitt invitert til ByggExp som ${roleLabel}.`,
    open: "Åpne lenken nedenfor for å bekrefte e-posten din og opprette et passord:",
    link: "Bekreft e-post og opprett passord",
    later:
      "Du kan også logge inn senere med e-posten din — be om en engangskode i appen.",
    expires: "Denne lenken utløper om 7 dager.",
  }),
  en: ({ name, roleLabel }) => ({
    subject: "Your ByggExp account invitation",
    hi: `Hi ${name},`,
    invited: `You have been invited to ByggExp as ${roleLabel}.`,
    open: "Open the link below to confirm your email and create a password:",
    link: "Confirm email and create password",
    later:
      "You can also sign in later with your email — request a one-time code in the app.",
    expires: "This link expires in 7 days.",
  }),
  pl: ({ name, roleLabel }) => ({
    subject: "Twoje zaproszenie do ByggExp",
    hi: `Cześć ${name},`,
    invited: `Zostałeś zaproszony do ByggExp jako ${roleLabel}.`,
    open: "Otwórz poniższy link, aby potwierdzić adres e-mail i utworzyć hasło:",
    link: "Potwierdź e-mail i utwórz hasło",
    later:
      "Możesz też zalogować się później swoim adresem e-mail — poproś o jednorazowy kod w aplikacji.",
    expires: "Ten link wygasa za 7 dni.",
  }),
  et: ({ name, roleLabel }) => ({
    subject: "Sinu kutse ByggExpi",
    hi: `Tere ${name},`,
    invited: `Sind on kutsutud ByggExpi kui ${roleLabel}.`,
    open: "Ava allolev link, et kinnitada oma e-post ja luua parool:",
    link: "Kinnita e-post ja loo parool",
    later:
      "Võid ka hiljem oma e-postiga sisse logida — küsi rakenduses ühekordset koodi.",
    expires: "See link aegub 7 päeva pärast.",
  }),
  uk: ({ name, roleLabel }) => ({
    subject: "Ваше запрошення до ByggExp",
    hi: `Вітаємо, ${name},`,
    invited: `Вас запросили до ByggExp як ${roleLabel}.`,
    open: "Відкрийте посилання нижче, щоб підтвердити електронну пошту та створити пароль:",
    link: "Підтвердити пошту та створити пароль",
    later:
      "Ви також можете увійти пізніше за своєю поштою — запросіть одноразовий код у застосунку.",
    expires: "Це посилання діє 7 днів.",
  }),
  ru: ({ name, roleLabel }) => ({
    subject: "Ваше приглашение в ByggExp",
    hi: `Здравствуйте, ${name},`,
    invited: `Вас пригласили в ByggExp как ${roleLabel}.`,
    open: "Откройте ссылку ниже, чтобы подтвердить эл. почту и создать пароль:",
    link: "Подтвердить почту и создать пароль",
    later:
      "Вы также можете войти позже по своей эл. почте — запросите одноразовый код в приложении.",
    expires: "Ссылка действительна 7 дней.",
  }),
  fi: ({ name, roleLabel }) => ({
    subject: "Kutsusi ByggExpiin",
    hi: `Hei ${name},`,
    invited: `Sinut on kutsuttu ByggExpiin roolilla ${roleLabel}.`,
    open: "Avaa alla oleva linkki vahvistaaksesi sähköpostisi ja luodaksesi salasanan:",
    link: "Vahvista sähköposti ja luo salasana",
    later:
      "Voit myös kirjautua myöhemmin sähköpostilla — pyydä kertakäyttökoodi sovelluksessa.",
    expires: "Tämä linkki vanhenee 7 päivän kuluttua.",
  }),
  lt: ({ name, roleLabel }) => ({
    subject: "Jūsų kvietimas į ByggExp",
    hi: `Sveiki, ${name},`,
    invited: `Jūs pakviestas į ByggExp kaip ${roleLabel}.`,
    open: "Atidarykite žemiau esančią nuorodą, kad patvirtintumėte el. paštą ir sukurtumėte slaptažodį:",
    link: "Patvirtinti el. paštą ir sukurti slaptažodį",
    later:
      "Taip pat galite prisijungti vėliau su savo el. paštu — paprašykite vienkartinio kodo programėlėje.",
    expires: "Ši nuoroda galioja 7 dienas.",
  }),
  lv: ({ name, roleLabel }) => ({
    subject: "Jūsu ielūgums uz ByggExp",
    hi: `Sveiki, ${name},`,
    invited: `Jūs esat uzaicināts uz ByggExp kā ${roleLabel}.`,
    open: "Atveriet zemāk esošo saiti, lai apstiprinātu savu e-pastu un izveidotu paroli:",
    link: "Apstiprināt e-pastu un izveidot paroli",
    later:
      "Varat arī pieteikties vēlāk ar savu e-pastu — pieprasiet vienreizēju kodu lietotnē.",
    expires: "Šī saite ir derīga 7 dienas.",
  }),
  bs: ({ name, roleLabel }) => ({
    subject: "Vaš poziv za ByggExp",
    hi: `Zdravo ${name},`,
    invited: `Pozvani ste u ByggExp kao ${roleLabel}.`,
    open: "Otvorite link ispod da potvrdite svoj e-mail i kreirate lozinku:",
    link: "Potvrdi e-mail i kreiraj lozinku",
    later:
      "Možete se prijaviti i kasnije svojim e-mailom — zatražite jednokratni kod u aplikaciji.",
    expires: "Ovaj link ističe za 7 dana.",
  }),
};

// Resolve a stored language hint (mobile "no", locale "gb"/"us", or a plain
// code) to one of our mail languages, defaulting to Swedish. Exported so the
// backend-served HTML pages (e.g. the invite create-password page) can localize
// to the SAME language the emails use.
export function resolveMailLang(hint?: string): MailLang {
  const h = (hint || "").toLowerCase();
  if (h === "no" || h === "nn") return "nb"; // mobile uses "no", mail uses "nb"
  if (h === "gb" || h === "us") return "en";
  return (MAIL_LANGS as string[]).includes(h) ? (h as MailLang) : "sv";
}

// Copy for the invite create-password PAGE (GET /auth/verify-email) — the HTML
// form the invited user lands on. Localized so the page matches the language of
// the invite email they clicked.
export type InvitePageCopy = {
  title: string;
  intro: string;
  passwordLabel: string;
  confirmLabel: string;
  passwordPlaceholder: string;
  confirmPlaceholder: string;
  submit: string;
  errShort: string;
  errMismatch: string;
};

export const invitePageCopy: Record<MailLang, () => InvitePageCopy> = {
  sv: () => ({
    title: "Skapa ditt lösenord",
    intro:
      "Välkommen till ByggExp! Välj ett lösenord för att aktivera ditt konto. Du loggar in med din e-post och detta lösenord i både appen och webbadmin.",
    passwordLabel: "Lösenord",
    confirmLabel: "Bekräfta lösenord",
    passwordPlaceholder: "Minst 6 tecken",
    confirmPlaceholder: "Upprepa lösenordet",
    submit: "Aktivera konto",
    errShort: "Lösenordet måste vara minst 6 tecken.",
    errMismatch: "Lösenorden matchar inte.",
  }),
  en: () => ({
    title: "Create your password",
    intro:
      "Welcome to ByggExp! Choose a password to finish activating your account. You'll use your email and this password to sign in on the app and the web admin.",
    passwordLabel: "Password",
    confirmLabel: "Confirm password",
    passwordPlaceholder: "At least 6 characters",
    confirmPlaceholder: "Repeat your password",
    submit: "Activate account",
    errShort: "Password must be at least 6 characters.",
    errMismatch: "Passwords don't match.",
  }),
  nb: () => ({
    title: "Opprett passordet ditt",
    intro:
      "Velkommen til ByggExp! Velg et passord for å aktivere kontoen din. Du logger inn med e-posten din og dette passordet i både appen og webadmin.",
    passwordLabel: "Passord",
    confirmLabel: "Bekreft passord",
    passwordPlaceholder: "Minst 6 tegn",
    confirmPlaceholder: "Gjenta passordet",
    submit: "Aktiver konto",
    errShort: "Passordet må være minst 6 tegn.",
    errMismatch: "Passordene stemmer ikke overens.",
  }),
  pl: () => ({
    title: "Utwórz hasło",
    intro:
      "Witamy w ByggExp! Wybierz hasło, aby aktywować konto. Będziesz logować się swoim adresem e-mail i tym hasłem w aplikacji i panelu web.",
    passwordLabel: "Hasło",
    confirmLabel: "Potwierdź hasło",
    passwordPlaceholder: "Co najmniej 6 znaków",
    confirmPlaceholder: "Powtórz hasło",
    submit: "Aktywuj konto",
    errShort: "Hasło musi mieć co najmniej 6 znaków.",
    errMismatch: "Hasła nie są zgodne.",
  }),
  et: () => ({
    title: "Loo oma parool",
    intro:
      "Tere tulemast ByggExpi! Vali parool, et oma konto aktiveerida. Logid sisse oma e-posti ja selle parooliga nii rakenduses kui ka veebiadminis.",
    passwordLabel: "Parool",
    confirmLabel: "Kinnita parool",
    passwordPlaceholder: "Vähemalt 6 tähemärki",
    confirmPlaceholder: "Korda parooli",
    submit: "Aktiveeri konto",
    errShort: "Parool peab olema vähemalt 6 tähemärki.",
    errMismatch: "Paroolid ei ühti.",
  }),
  uk: () => ({
    title: "Створіть пароль",
    intro:
      "Ласкаво просимо до ByggExp! Виберіть пароль, щоб активувати обліковий запис. Ви входитимете за своєю поштою та цим паролем і в застосунку, і у веб-адмінці.",
    passwordLabel: "Пароль",
    confirmLabel: "Підтвердьте пароль",
    passwordPlaceholder: "Щонайменше 6 символів",
    confirmPlaceholder: "Повторіть пароль",
    submit: "Активувати обліковий запис",
    errShort: "Пароль має містити щонайменше 6 символів.",
    errMismatch: "Паролі не збігаються.",
  }),
  ru: () => ({
    title: "Создайте пароль",
    intro:
      "Добро пожаловать в ByggExp! Выберите пароль, чтобы активировать аккаунт. Вы будете входить по своей эл. почте и этому паролю и в приложении, и в веб-админке.",
    passwordLabel: "Пароль",
    confirmLabel: "Подтвердите пароль",
    passwordPlaceholder: "Не менее 6 символов",
    confirmPlaceholder: "Повторите пароль",
    submit: "Активировать аккаунт",
    errShort: "Пароль должен быть не менее 6 символов.",
    errMismatch: "Пароли не совпадают.",
  }),
  fi: () => ({
    title: "Luo salasanasi",
    intro:
      "Tervetuloa ByggExpiin! Valitse salasana viimeistelläksesi tilisi aktivoinnin. Kirjaudut sähköpostillasi ja tällä salasanalla sekä sovelluksessa että verkkoadminissa.",
    passwordLabel: "Salasana",
    confirmLabel: "Vahvista salasana",
    passwordPlaceholder: "Vähintään 6 merkkiä",
    confirmPlaceholder: "Toista salasana",
    submit: "Aktivoi tili",
    errShort: "Salasanan on oltava vähintään 6 merkkiä.",
    errMismatch: "Salasanat eivät täsmää.",
  }),
  lt: () => ({
    title: "Sukurkite slaptažodį",
    intro:
      "Sveiki atvykę į ByggExp! Pasirinkite slaptažodį, kad aktyvuotumėte paskyrą. Prisijungsite su savo el. paštu ir šiuo slaptažodžiu tiek programėlėje, tiek žiniatinklio administratoriuje.",
    passwordLabel: "Slaptažodis",
    confirmLabel: "Patvirtinkite slaptažodį",
    passwordPlaceholder: "Bent 6 simboliai",
    confirmPlaceholder: "Pakartokite slaptažodį",
    submit: "Aktyvuoti paskyrą",
    errShort: "Slaptažodį turi sudaryti bent 6 simboliai.",
    errMismatch: "Slaptažodžiai nesutampa.",
  }),
  lv: () => ({
    title: "Izveidojiet paroli",
    intro:
      "Laipni lūdzam ByggExp! Izvēlieties paroli, lai aktivizētu savu kontu. Jūs pieteiksieties ar savu e-pastu un šo paroli gan lietotnē, gan tīmekļa administratorā.",
    passwordLabel: "Parole",
    confirmLabel: "Apstipriniet paroli",
    passwordPlaceholder: "Vismaz 6 rakstzīmes",
    confirmPlaceholder: "Atkārtojiet paroli",
    submit: "Aktivizēt kontu",
    errShort: "Parolei jābūt vismaz 6 rakstzīmēm.",
    errMismatch: "Paroles nesakrīt.",
  }),
  bs: () => ({
    title: "Kreirajte lozinku",
    intro:
      "Dobro došli u ByggExp! Odaberite lozinku da aktivirate svoj račun. Prijavljivat ćete se svojim e-mailom i ovom lozinkom u aplikaciji i web adminu.",
    passwordLabel: "Lozinka",
    confirmLabel: "Potvrdite lozinku",
    passwordPlaceholder: "Najmanje 6 znakova",
    confirmPlaceholder: "Ponovite lozinku",
    submit: "Aktiviraj račun",
    errShort: "Lozinka mora imati najmanje 6 znakova.",
    errMismatch: "Lozinke se ne podudaraju.",
  }),
};

// Copy for the OTHER backend-served auth HTML pages (reset-password form +
// success, register-company choose-password form, the app/web destination
// chooser, the "email confirmed" deep-link page, and the app-store fallback).
// Localized the same way as the emails so a user never lands on a page in a
// language different from the mail they clicked. Password field labels/alerts
// are shared with invitePageCopy (see the controller) and not repeated here.
export type AuthPageCopy = {
  resetTitle: string;
  resetIntro: string;
  resetSubmit: string;
  confirmTitle: string;
  confirmIntro: string;
  confirmSubmit: string;
  okTitle: string;
  okBody: string;
  okOpenApp: string;
  okWebAdmin: string;
  destTitle: string;
  destQuestion: string;
  destOpenApp: string;
  destOpenWebAdmin: string;
  confirmedTitle: string;
  confirmedMessage: string;
  confirmedOpenApp: string;
  confirmedHint: string;
  fallbackTitle: string;
  fallbackBody: string;
  fallbackIos: string;
  fallbackAndroid: string;
  errorTitle: string;
};

export const authPageCopy: Record<MailLang, () => AuthPageCopy> = {
  sv: () => ({
    resetTitle: "Återställ ditt lösenord",
    resetIntro:
      "Välj ett nytt lösenord för ditt ByggExp-konto. Du loggar in med din e-post och detta lösenord.",
    resetSubmit: "Ange nytt lösenord",
    confirmTitle: "Välj ditt lösenord",
    confirmIntro:
      "Välj ett lösenord för att slutföra ditt ByggExp-konto. Du loggar in med din e-post och detta lösenord.",
    confirmSubmit: "Skapa konto",
    okTitle: "Lösenordet uppdaterat",
    okBody:
      "Ditt lösenord har ändrats. Öppna appen och logga in med ditt nya lösenord.",
    okOpenApp: "Öppna appen",
    okWebAdmin: "eller logga in i webbadmin",
    destTitle: "Konto klart",
    destQuestion: "Var vill du fortsätta?",
    destOpenApp: "Öppna appen",
    destOpenWebAdmin: "Öppna webbadmin",
    confirmedTitle: "E-post bekräftad",
    confirmedMessage: "Kontot är aktiverat. Öppnar ByggExp för att logga in dig.",
    confirmedOpenApp: "Öppna ByggExp",
    confirmedHint:
      "Tryck på knappen för att öppna appen och logga in. Har du inte appen? Installera ByggExp, öppna den och logga in med din e-post och ditt lösenord.",
    fallbackTitle: "Öppna ByggExp",
    fallbackBody: "Ladda ner appen och logga sedan in med din e-post och ditt lösenord.",
    fallbackIos: "Ladda ner för iPhone",
    fallbackAndroid: "Ladda ner för Android",
    errorTitle: "Något gick fel",
  }),
  en: () => ({
    resetTitle: "Reset your password",
    resetIntro:
      "Choose a new password for your ByggExp account. You'll sign in with your email and this password.",
    resetSubmit: "Set new password",
    confirmTitle: "Choose your password",
    confirmIntro:
      "Set a password to finish creating your ByggExp account. You'll sign in with your email and this password.",
    confirmSubmit: "Create account",
    okTitle: "Password updated",
    okBody:
      "Your password has been changed. Open the app and sign in with your new password.",
    okOpenApp: "Open the app",
    okWebAdmin: "or sign in on the web admin",
    destTitle: "Account ready",
    destQuestion: "Where do you want to continue?",
    destOpenApp: "Open the app",
    destOpenWebAdmin: "Open web admin",
    confirmedTitle: "Email confirmed",
    confirmedMessage: "Account activated. Opening ByggExp to sign you in.",
    confirmedOpenApp: "Open ByggExp",
    confirmedHint:
      "Tap the button to open the app and sign in. Don't have the app? Install ByggExp, open it and sign in with your email and password.",
    fallbackTitle: "Open ByggExp",
    fallbackBody: "Download the app, then sign in with your email and password.",
    fallbackIos: "Download for iPhone",
    fallbackAndroid: "Download for Android",
    errorTitle: "Something went wrong",
  }),
  nb: () => ({
    resetTitle: "Tilbakestill passordet ditt",
    resetIntro:
      "Velg et nytt passord for ByggExp-kontoen din. Du logger inn med e-posten din og dette passordet.",
    resetSubmit: "Angi nytt passord",
    confirmTitle: "Velg passordet ditt",
    confirmIntro:
      "Velg et passord for å fullføre ByggExp-kontoen din. Du logger inn med e-posten din og dette passordet.",
    confirmSubmit: "Opprett konto",
    okTitle: "Passordet er oppdatert",
    okBody:
      "Passordet ditt er endret. Åpne appen og logg inn med det nye passordet.",
    okOpenApp: "Åpne appen",
    okWebAdmin: "eller logg inn i webadmin",
    destTitle: "Kontoen er klar",
    destQuestion: "Hvor vil du fortsette?",
    destOpenApp: "Åpne appen",
    destOpenWebAdmin: "Åpne webadmin",
    confirmedTitle: "E-post bekreftet",
    confirmedMessage: "Kontoen er aktivert. Åpner ByggExp for å logge deg inn.",
    confirmedOpenApp: "Åpne ByggExp",
    confirmedHint:
      "Trykk på knappen for å åpne appen og logge inn. Har du ikke appen? Installer ByggExp, åpne den og logg inn med e-post og passord.",
    fallbackTitle: "Åpne ByggExp",
    fallbackBody: "Last ned appen og logg deretter inn med e-post og passord.",
    fallbackIos: "Last ned for iPhone",
    fallbackAndroid: "Last ned for Android",
    errorTitle: "Noe gikk galt",
  }),
  pl: () => ({
    resetTitle: "Zresetuj hasło",
    resetIntro:
      "Wybierz nowe hasło do swojego konta ByggExp. Będziesz logować się swoim adresem e-mail i tym hasłem.",
    resetSubmit: "Ustaw nowe hasło",
    confirmTitle: "Wybierz hasło",
    confirmIntro:
      "Ustaw hasło, aby dokończyć tworzenie konta ByggExp. Będziesz logować się swoim adresem e-mail i tym hasłem.",
    confirmSubmit: "Utwórz konto",
    okTitle: "Hasło zaktualizowane",
    okBody:
      "Twoje hasło zostało zmienione. Otwórz aplikację i zaloguj się nowym hasłem.",
    okOpenApp: "Otwórz aplikację",
    okWebAdmin: "lub zaloguj się w panelu web",
    destTitle: "Konto gotowe",
    destQuestion: "Gdzie chcesz kontynuować?",
    destOpenApp: "Otwórz aplikację",
    destOpenWebAdmin: "Otwórz panel web",
    confirmedTitle: "E-mail potwierdzony",
    confirmedMessage: "Konto aktywowane. Otwieram ByggExp, aby Cię zalogować.",
    confirmedOpenApp: "Otwórz ByggExp",
    confirmedHint:
      "Naciśnij przycisk, aby otworzyć aplikację i zalogować się. Nie masz aplikacji? Zainstaluj ByggExp, otwórz ją i zaloguj się swoim adresem e-mail i hasłem.",
    fallbackTitle: "Otwórz ByggExp",
    fallbackBody: "Pobierz aplikację, a następnie zaloguj się e-mailem i hasłem.",
    fallbackIos: "Pobierz na iPhone'a",
    fallbackAndroid: "Pobierz na Androida",
    errorTitle: "Coś poszło nie tak",
  }),
  et: () => ({
    resetTitle: "Lähtesta oma parool",
    resetIntro:
      "Vali oma ByggExpi kontole uus parool. Logid sisse oma e-posti ja selle parooliga.",
    resetSubmit: "Määra uus parool",
    confirmTitle: "Vali oma parool",
    confirmIntro:
      "Määra parool, et oma ByggExpi konto loomine lõpetada. Logid sisse oma e-posti ja selle parooliga.",
    confirmSubmit: "Loo konto",
    okTitle: "Parool uuendatud",
    okBody:
      "Sinu parool on muudetud. Ava rakendus ja logi sisse uue parooliga.",
    okOpenApp: "Ava rakendus",
    okWebAdmin: "või logi sisse veebiadminis",
    destTitle: "Konto valmis",
    destQuestion: "Kust soovid jätkata?",
    destOpenApp: "Ava rakendus",
    destOpenWebAdmin: "Ava veebiadmin",
    confirmedTitle: "E-post kinnitatud",
    confirmedMessage: "Konto aktiveeritud. Avan ByggExpi, et sind sisse logida.",
    confirmedOpenApp: "Ava ByggExp",
    confirmedHint:
      "Vajuta nuppu, et rakendus avada ja sisse logida. Kas sul pole rakendust? Paigalda ByggExp, ava see ja logi sisse oma e-posti ja parooliga.",
    fallbackTitle: "Ava ByggExp",
    fallbackBody: "Laadi rakendus alla ja logi seejärel sisse oma e-posti ja parooliga.",
    fallbackIos: "Laadi alla iPhone'ile",
    fallbackAndroid: "Laadi alla Androidile",
    errorTitle: "Midagi läks valesti",
  }),
  uk: () => ({
    resetTitle: "Скиньте пароль",
    resetIntro:
      "Виберіть новий пароль для облікового запису ByggExp. Ви входитимете за своєю поштою та цим паролем.",
    resetSubmit: "Встановити новий пароль",
    confirmTitle: "Виберіть пароль",
    confirmIntro:
      "Встановіть пароль, щоб завершити створення облікового запису ByggExp. Ви входитимете за своєю поштою та цим паролем.",
    confirmSubmit: "Створити обліковий запис",
    okTitle: "Пароль оновлено",
    okBody:
      "Ваш пароль змінено. Відкрийте застосунок і увійдіть із новим паролем.",
    okOpenApp: "Відкрити застосунок",
    okWebAdmin: "або увійдіть у веб-адмінці",
    destTitle: "Обліковий запис готовий",
    destQuestion: "Куди бажаєте продовжити?",
    destOpenApp: "Відкрити застосунок",
    destOpenWebAdmin: "Відкрити веб-адмінку",
    confirmedTitle: "Пошту підтверджено",
    confirmedMessage: "Обліковий запис активовано. Відкриваю ByggExp, щоб вас увійти.",
    confirmedOpenApp: "Відкрити ByggExp",
    confirmedHint:
      "Натисніть кнопку, щоб відкрити застосунок і увійти. Немає застосунку? Встановіть ByggExp, відкрийте його та увійдіть за своєю поштою й паролем.",
    fallbackTitle: "Відкрити ByggExp",
    fallbackBody: "Завантажте застосунок, потім увійдіть за поштою та паролем.",
    fallbackIos: "Завантажити для iPhone",
    fallbackAndroid: "Завантажити для Android",
    errorTitle: "Щось пішло не так",
  }),
  ru: () => ({
    resetTitle: "Сбросьте пароль",
    resetIntro:
      "Выберите новый пароль для аккаунта ByggExp. Вы будете входить по своей эл. почте и этому паролю.",
    resetSubmit: "Задать новый пароль",
    confirmTitle: "Выберите пароль",
    confirmIntro:
      "Задайте пароль, чтобы завершить создание аккаунта ByggExp. Вы будете входить по своей эл. почте и этому паролю.",
    confirmSubmit: "Создать аккаунт",
    okTitle: "Пароль обновлён",
    okBody:
      "Ваш пароль изменён. Откройте приложение и войдите с новым паролем.",
    okOpenApp: "Открыть приложение",
    okWebAdmin: "или войдите в веб-админке",
    destTitle: "Аккаунт готов",
    destQuestion: "Куда хотите продолжить?",
    destOpenApp: "Открыть приложение",
    destOpenWebAdmin: "Открыть веб-админку",
    confirmedTitle: "Почта подтверждена",
    confirmedMessage: "Аккаунт активирован. Открываю ByggExp, чтобы войти.",
    confirmedOpenApp: "Открыть ByggExp",
    confirmedHint:
      "Нажмите кнопку, чтобы открыть приложение и войти. Нет приложения? Установите ByggExp, откройте его и войдите по своей эл. почте и паролю.",
    fallbackTitle: "Открыть ByggExp",
    fallbackBody: "Скачайте приложение, затем войдите по эл. почте и паролю.",
    fallbackIos: "Скачать для iPhone",
    fallbackAndroid: "Скачать для Android",
    errorTitle: "Что-то пошло не так",
  }),
  fi: () => ({
    resetTitle: "Nollaa salasanasi",
    resetIntro:
      "Valitse uusi salasana ByggExp-tilillesi. Kirjaudut sähköpostillasi ja tällä salasanalla.",
    resetSubmit: "Aseta uusi salasana",
    confirmTitle: "Valitse salasanasi",
    confirmIntro:
      "Aseta salasana viimeistelläksesi ByggExp-tilisi. Kirjaudut sähköpostillasi ja tällä salasanalla.",
    confirmSubmit: "Luo tili",
    okTitle: "Salasana päivitetty",
    okBody:
      "Salasanasi on vaihdettu. Avaa sovellus ja kirjaudu uudella salasanalla.",
    okOpenApp: "Avaa sovellus",
    okWebAdmin: "tai kirjaudu verkkoadminissa",
    destTitle: "Tili valmis",
    destQuestion: "Missä haluat jatkaa?",
    destOpenApp: "Avaa sovellus",
    destOpenWebAdmin: "Avaa verkkoadmin",
    confirmedTitle: "Sähköposti vahvistettu",
    confirmedMessage: "Tili aktivoitu. Avataan ByggExp kirjatakseen sinut sisään.",
    confirmedOpenApp: "Avaa ByggExp",
    confirmedHint:
      "Avaa sovellus ja kirjaudu painamalla painiketta. Eikö sinulla ole sovellusta? Asenna ByggExp, avaa se ja kirjaudu sähköpostillasi ja salasanallasi.",
    fallbackTitle: "Avaa ByggExp",
    fallbackBody: "Lataa sovellus ja kirjaudu sitten sähköpostilla ja salasanalla.",
    fallbackIos: "Lataa iPhonelle",
    fallbackAndroid: "Lataa Androidille",
    errorTitle: "Jotain meni pieleen",
  }),
  lt: () => ({
    resetTitle: "Atkurkite slaptažodį",
    resetIntro:
      "Pasirinkite naują ByggExp paskyros slaptažodį. Prisijungsite su savo el. paštu ir šiuo slaptažodžiu.",
    resetSubmit: "Nustatyti naują slaptažodį",
    confirmTitle: "Pasirinkite slaptažodį",
    confirmIntro:
      "Nustatykite slaptažodį, kad užbaigtumėte ByggExp paskyros kūrimą. Prisijungsite su savo el. paštu ir šiuo slaptažodžiu.",
    confirmSubmit: "Sukurti paskyrą",
    okTitle: "Slaptažodis atnaujintas",
    okBody:
      "Jūsų slaptažodis pakeistas. Atidarykite programėlę ir prisijunkite su nauju slaptažodžiu.",
    okOpenApp: "Atidaryti programėlę",
    okWebAdmin: "arba prisijunkite žiniatinklio administratoriuje",
    destTitle: "Paskyra paruošta",
    destQuestion: "Kur norite tęsti?",
    destOpenApp: "Atidaryti programėlę",
    destOpenWebAdmin: "Atidaryti žiniatinklio administratorių",
    confirmedTitle: "El. paštas patvirtintas",
    confirmedMessage: "Paskyra aktyvuota. Atidaroma ByggExp, kad jus prijungtų.",
    confirmedOpenApp: "Atidaryti ByggExp",
    confirmedHint:
      "Paspauskite mygtuką, kad atidarytumėte programėlę ir prisijungtumėte. Neturite programėlės? Įdiekite ByggExp, atidarykite ją ir prisijunkite su savo el. paštu ir slaptažodžiu.",
    fallbackTitle: "Atidaryti ByggExp",
    fallbackBody: "Atsisiųskite programėlę, tada prisijunkite su el. paštu ir slaptažodžiu.",
    fallbackIos: "Atsisiųsti iPhone",
    fallbackAndroid: "Atsisiųsti Android",
    errorTitle: "Kažkas nutiko",
  }),
  lv: () => ({
    resetTitle: "Atiestatiet paroli",
    resetIntro:
      "Izvēlieties jaunu ByggExp konta paroli. Jūs pieteiksieties ar savu e-pastu un šo paroli.",
    resetSubmit: "Iestatīt jaunu paroli",
    confirmTitle: "Izvēlieties paroli",
    confirmIntro:
      "Iestatiet paroli, lai pabeigtu ByggExp konta izveidi. Jūs pieteiksieties ar savu e-pastu un šo paroli.",
    confirmSubmit: "Izveidot kontu",
    okTitle: "Parole atjaunināta",
    okBody:
      "Jūsu parole ir nomainīta. Atveriet lietotni un piesakieties ar jauno paroli.",
    okOpenApp: "Atvērt lietotni",
    okWebAdmin: "vai piesakieties tīmekļa administratorā",
    destTitle: "Konts gatavs",
    destQuestion: "Kur vēlaties turpināt?",
    destOpenApp: "Atvērt lietotni",
    destOpenWebAdmin: "Atvērt tīmekļa administratoru",
    confirmedTitle: "E-pasts apstiprināts",
    confirmedMessage: "Konts aktivizēts. Atveru ByggExp, lai jūs pieteiktu.",
    confirmedOpenApp: "Atvērt ByggExp",
    confirmedHint:
      "Nospiediet pogu, lai atvērtu lietotni un pieteiktos. Nav lietotnes? Instalējiet ByggExp, atveriet to un piesakieties ar savu e-pastu un paroli.",
    fallbackTitle: "Atvērt ByggExp",
    fallbackBody: "Lejupielādējiet lietotni, pēc tam piesakieties ar e-pastu un paroli.",
    fallbackIos: "Lejupielādēt iPhone",
    fallbackAndroid: "Lejupielādēt Android",
    errorTitle: "Kaut kas nogāja greizi",
  }),
  bs: () => ({
    resetTitle: "Resetujte lozinku",
    resetIntro:
      "Odaberite novu lozinku za svoj ByggExp račun. Prijavljivat ćete se svojim e-mailom i ovom lozinkom.",
    resetSubmit: "Postavi novu lozinku",
    confirmTitle: "Odaberite lozinku",
    confirmIntro:
      "Postavite lozinku da završite kreiranje ByggExp računa. Prijavljivat ćete se svojim e-mailom i ovom lozinkom.",
    confirmSubmit: "Kreiraj račun",
    okTitle: "Lozinka ažurirana",
    okBody:
      "Vaša lozinka je promijenjena. Otvorite aplikaciju i prijavite se novom lozinkom.",
    okOpenApp: "Otvori aplikaciju",
    okWebAdmin: "ili se prijavite u web adminu",
    destTitle: "Račun spreman",
    destQuestion: "Gdje želite nastaviti?",
    destOpenApp: "Otvori aplikaciju",
    destOpenWebAdmin: "Otvori web admin",
    confirmedTitle: "E-mail potvrđen",
    confirmedMessage: "Račun aktiviran. Otvaram ByggExp da vas prijavim.",
    confirmedOpenApp: "Otvori ByggExp",
    confirmedHint:
      "Pritisnite dugme da otvorite aplikaciju i prijavite se. Nemate aplikaciju? Instalirajte ByggExp, otvorite je i prijavite se svojim e-mailom i lozinkom.",
    fallbackTitle: "Otvori ByggExp",
    fallbackBody: "Preuzmite aplikaciju, zatim se prijavite e-mailom i lozinkom.",
    fallbackIos: "Preuzmi za iPhone",
    fallbackAndroid: "Preuzmi za Android",
    errorTitle: "Nešto je pošlo po zlu",
  }),
};

export type ResetCopy = {
  subject: string;
  hi: string;
  intro: string;
  button: string;
  expires: string;
};

export const resetCopy: Record<
  MailLang,
  (vars: { name: string }) => ResetCopy
> = {
  sv: ({ name }) => ({
    subject: "Återställ ditt ByggExp-lösenord",
    hi: `Hej ${name},`,
    intro:
      "Vi fick en begäran om att återställa ditt ByggExp-lösenord. Öppna länken nedan för att välja ett nytt:",
    button: "Återställ mitt lösenord",
    expires:
      "Länken går ut om 1 timme. Om du inte begärde detta kan du ignorera mejlet — ditt lösenord förblir oförändrat.",
  }),
  nb: ({ name }) => ({
    subject: "Tilbakestill ByggExp-passordet ditt",
    hi: `Hei ${name},`,
    intro:
      "Vi mottok en forespørsel om å tilbakestille ByggExp-passordet ditt. Åpne lenken nedenfor for å velge et nytt:",
    button: "Tilbakestill passordet mitt",
    expires:
      "Lenken utløper om 1 time. Hvis du ikke ba om dette, kan du ignorere e-posten — passordet ditt forblir uendret.",
  }),
  en: ({ name }) => ({
    subject: "Reset your ByggExp password",
    hi: `Hi ${name},`,
    intro:
      "We received a request to reset your ByggExp password. Open the link below to choose a new one:",
    button: "Reset my password",
    expires:
      "This link expires in 1 hour. If you didn't request this, you can ignore this email — your password stays the same.",
  }),
  pl: ({ name }) => ({
    subject: "Zresetuj hasło do ByggExp",
    hi: `Cześć ${name},`,
    intro:
      "Otrzymaliśmy prośbę o zresetowanie Twojego hasła do ByggExp. Otwórz poniższy link, aby wybrać nowe:",
    button: "Zresetuj moje hasło",
    expires:
      "Ten link wygasa za 1 godzinę. Jeśli to nie Ty, zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.",
  }),
  et: ({ name }) => ({
    subject: "Lähtesta oma ByggExpi parool",
    hi: `Tere ${name},`,
    intro:
      "Saime taotluse sinu ByggExpi parooli lähtestamiseks. Ava allolev link, et valida uus:",
    button: "Lähtesta parool",
    expires:
      "Link aegub 1 tunni pärast. Kui sina seda ei taotlenud, võid selle kirja ignoreerida — parool jääb samaks.",
  }),
  uk: ({ name }) => ({
    subject: "Скидання пароля ByggExp",
    hi: `Вітаємо, ${name},`,
    intro:
      "Ми отримали запит на скидання вашого пароля ByggExp. Відкрийте посилання нижче, щоб обрати новий:",
    button: "Скинути пароль",
    expires:
      "Посилання діє 1 годину. Якщо це були не ви, проігноруйте цей лист — пароль залишиться незмінним.",
  }),
  ru: ({ name }) => ({
    subject: "Сброс пароля ByggExp",
    hi: `Здравствуйте, ${name},`,
    intro:
      "Мы получили запрос на сброс вашего пароля ByggExp. Откройте ссылку ниже, чтобы выбрать новый:",
    button: "Сбросить пароль",
    expires:
      "Ссылка действует 1 час. Если это были не вы, проигнорируйте это письмо — пароль останется прежним.",
  }),
  fi: ({ name }) => ({
    subject: "Palauta ByggExp-salasanasi",
    hi: `Hei ${name},`,
    intro:
      "Saimme pyynnön ByggExp-salasanasi palauttamisesta. Avaa alla oleva linkki valitaksesi uuden:",
    button: "Palauta salasanani",
    expires:
      "Linkki vanhenee 1 tunnin kuluttua. Jos et pyytänyt tätä, voit jättää viestin huomiotta — salasanasi pysyy samana.",
  }),
  lt: ({ name }) => ({
    subject: "Atkurkite ByggExp slaptažodį",
    hi: `Sveiki, ${name},`,
    intro:
      "Gavome prašymą atkurti jūsų ByggExp slaptažodį. Atidarykite žemiau esančią nuorodą naujam pasirinkti:",
    button: "Atkurti slaptažodį",
    expires:
      "Nuoroda galioja 1 valandą. Jei to neprašėte, ignoruokite šį laišką — slaptažodis liks nepakeistas.",
  }),
  lv: ({ name }) => ({
    subject: "Atiestatiet ByggExp paroli",
    hi: `Sveiki, ${name},`,
    intro:
      "Mēs saņēmām pieprasījumu atiestatīt jūsu ByggExp paroli. Atveriet zemāk esošo saiti, lai izvēlētos jaunu:",
    button: "Atiestatīt paroli",
    expires:
      "Saite ir derīga 1 stundu. Ja tas nebijāt jūs, ignorējiet šo e-pastu — parole paliks nemainīga.",
  }),
  bs: ({ name }) => ({
    subject: "Resetujte svoju ByggExp lozinku",
    hi: `Zdravo ${name},`,
    intro:
      "Primili smo zahtjev za resetovanje vaše ByggExp lozinke. Otvorite link ispod da izaberete novu:",
    button: "Resetuj lozinku",
    expires:
      "Ovaj link ističe za 1 sat. Ako niste vi to zatražili, ignorišite ovaj e-mail — lozinka ostaje ista.",
  }),
};

// Fallback for a missing company name ("your company").
export const COMPANY_FALLBACK: Record<MailLang, string> = {
  sv: "ditt företag",
  nb: "bedriften din",
  en: "your company",
  pl: "Twoja firma",
  et: "sinu ettevõte",
  uk: "ваша компанія",
  ru: "ваша компания",
  fi: "yrityksesi",
  lt: "jūsų įmonė",
  lv: "jūsu uzņēmums",
  bs: "vaša firma",
};

export type CompanyInviteCopy = {
  subject: string;
  intro: string;
  introHtml: string;
  open: string;
  link: string;
  expires: string;
};

// `name` is HTML-escaped (goes inside <strong>), `plainName` is for the text part.
export const companyInviteCopy: Record<
  MailLang,
  (vars: { name: string; plainName: string }) => CompanyInviteCopy
> = {
  sv: ({ name, plainName }) => ({
    subject: "Du är inbjuden till ByggExp",
    intro: `Du har blivit inbjuden att sätta upp ${plainName} på ByggExp.`,
    introHtml: `Du har blivit inbjuden att sätta upp <strong>${name}</strong> på <strong>ByggExp</strong>.`,
    open: "Öppna länken nedan för att skapa ditt administratörskonto (namn + lösenord):",
    link: "Acceptera inbjudan och skapa konto",
    expires: "Denna inbjudan går ut om 7 dagar.",
  }),
  nb: ({ name, plainName }) => ({
    subject: "Du er invitert til ByggExp",
    intro: `Du har blitt invitert til å sette opp ${plainName} på ByggExp.`,
    introHtml: `Du har blitt invitert til å sette opp <strong>${name}</strong> på <strong>ByggExp</strong>.`,
    open: "Åpne lenken nedenfor for å opprette administratorkontoen din (navn + passord):",
    link: "Godta invitasjon og opprett konto",
    expires: "Denne invitasjonen utløper om 7 dager.",
  }),
  en: ({ name, plainName }) => ({
    subject: "You are invited to ByggExp",
    intro: `You have been invited to set up ${plainName} on ByggExp.`,
    introHtml: `You have been invited to set up <strong>${name}</strong> on <strong>ByggExp</strong>.`,
    open: "Open the link below to create your admin account (name + password):",
    link: "Accept invitation and create account",
    expires: "This invitation expires in 7 days.",
  }),
  pl: ({ name, plainName }) => ({
    subject: "Zaproszenie do ByggExp",
    intro: `Otrzymałeś zaproszenie do skonfigurowania ${plainName} w ByggExp.`,
    introHtml: `Otrzymałeś zaproszenie do skonfigurowania <strong>${name}</strong> w <strong>ByggExp</strong>.`,
    open: "Otwórz poniższy link, aby utworzyć konto administratora (imię + hasło):",
    link: "Przyjmij zaproszenie i utwórz konto",
    expires: "To zaproszenie wygasa za 7 dni.",
  }),
  et: ({ name, plainName }) => ({
    subject: "Kutse ByggExpi",
    intro: `Sind on kutsutud seadistama ${plainName} ByggExpis.`,
    introHtml: `Sind on kutsutud seadistama <strong>${name}</strong> keskkonnas <strong>ByggExp</strong>.`,
    open: "Ava allolev link, et luua oma administraatori konto (nimi + parool):",
    link: "Võta kutse vastu ja loo konto",
    expires: "See kutse aegub 7 päeva pärast.",
  }),
  uk: ({ name, plainName }) => ({
    subject: "Запрошення до ByggExp",
    intro: `Вас запросили налаштувати ${plainName} у ByggExp.`,
    introHtml: `Вас запросили налаштувати <strong>${name}</strong> у <strong>ByggExp</strong>.`,
    open: "Відкрийте посилання нижче, щоб створити обліковий запис адміністратора (ім'я + пароль):",
    link: "Прийняти запрошення та створити акаунт",
    expires: "Це запрошення діє 7 днів.",
  }),
  ru: ({ name, plainName }) => ({
    subject: "Приглашение в ByggExp",
    intro: `Вас пригласили настроить ${plainName} в ByggExp.`,
    introHtml: `Вас пригласили настроить <strong>${name}</strong> в <strong>ByggExp</strong>.`,
    open: "Откройте ссылку ниже, чтобы создать учётную запись администратора (имя + пароль):",
    link: "Принять приглашение и создать аккаунт",
    expires: "Это приглашение действует 7 дней.",
  }),
  fi: ({ name, plainName }) => ({
    subject: "Kutsu ByggExpiin",
    intro: `Sinut on kutsuttu ottamaan käyttöön ${plainName} ByggExpissä.`,
    introHtml: `Sinut on kutsuttu ottamaan käyttöön <strong>${name}</strong> palvelussa <strong>ByggExp</strong>.`,
    open: "Avaa alla oleva linkki luodaksesi järjestelmänvalvojan tilin (nimi + salasana):",
    link: "Hyväksy kutsu ja luo tili",
    expires: "Tämä kutsu vanhenee 7 päivän kuluttua.",
  }),
  lt: ({ name, plainName }) => ({
    subject: "Kvietimas į ByggExp",
    intro: `Esate pakviestas sukonfigūruoti ${plainName} sistemoje ByggExp.`,
    introHtml: `Esate pakviestas sukonfigūruoti <strong>${name}</strong> sistemoje <strong>ByggExp</strong>.`,
    open: "Atidarykite žemiau esančią nuorodą, kad sukurtumėte administratoriaus paskyrą (vardas + slaptažodis):",
    link: "Priimti kvietimą ir sukurti paskyrą",
    expires: "Šis kvietimas galioja 7 dienas.",
  }),
  lv: ({ name, plainName }) => ({
    subject: "Ielūgums uz ByggExp",
    intro: `Jūs esat uzaicināts iestatīt ${plainName} sistēmā ByggExp.`,
    introHtml: `Jūs esat uzaicināts iestatīt <strong>${name}</strong> sistēmā <strong>ByggExp</strong>.`,
    open: "Atveriet zemāk esošo saiti, lai izveidotu administratora kontu (vārds + parole):",
    link: "Pieņemt ielūgumu un izveidot kontu",
    expires: "Šis ielūgums ir derīgs 7 dienas.",
  }),
  bs: ({ name, plainName }) => ({
    subject: "Poziv za ByggExp",
    intro: `Pozvani ste da postavite ${plainName} na ByggExp.`,
    introHtml: `Pozvani ste da postavite <strong>${name}</strong> na <strong>ByggExp</strong>.`,
    open: "Otvorite link ispod da kreirate svoj administratorski nalog (ime + lozinka):",
    link: "Prihvati poziv i kreiraj nalog",
    expires: "Ovaj poziv ističe za 7 dana.",
  }),
};

export type LoginCodeCopy = {
  subject: string;
  hi: string;
  intro: string;
  expires: string;
};

export const loginCodeCopy: Record<
  MailLang,
  (vars: { name: string }) => LoginCodeCopy
> = {
  sv: ({ name }) => ({
    subject: "Din inloggningskod för ByggExp",
    hi: `Hej ${name},`,
    intro: "Din inloggningskod för ByggExp:",
    expires:
      "Den går ut om 15 minuter. Om du inte begärde detta kan du ignorera mejlet.",
  }),
  nb: ({ name }) => ({
    subject: "Din innloggingskode for ByggExp",
    hi: `Hei ${name},`,
    intro: "Din innloggingskode for ByggExp:",
    expires:
      "Den utløper om 15 minutter. Hvis du ikke ba om dette, kan du ignorere e-posten.",
  }),
  en: ({ name }) => ({
    subject: "Your ByggExp sign-in code",
    hi: `Hi ${name},`,
    intro: "Your ByggExp sign-in code:",
    expires:
      "It expires in 15 minutes. If you didn't request this, you can ignore this email.",
  }),
  pl: ({ name }) => ({
    subject: "Twój kod logowania do ByggExp",
    hi: `Cześć ${name},`,
    intro: "Twój kod logowania do ByggExp:",
    expires:
      "Wygasa za 15 minut. Jeśli to nie Ty, zignoruj tę wiadomość.",
  }),
  et: ({ name }) => ({
    subject: "Sinu ByggExpi sisselogimiskood",
    hi: `Tere ${name},`,
    intro: "Sinu ByggExpi sisselogimiskood:",
    expires:
      "See aegub 15 minuti pärast. Kui sina seda ei taotlenud, võid kirja ignoreerida.",
  }),
  uk: ({ name }) => ({
    subject: "Ваш код входу ByggExp",
    hi: `Вітаємо, ${name},`,
    intro: "Ваш код входу ByggExp:",
    expires:
      "Він діє 15 хвилин. Якщо це були не ви, проігноруйте цей лист.",
  }),
  ru: ({ name }) => ({
    subject: "Ваш код входа ByggExp",
    hi: `Здравствуйте, ${name},`,
    intro: "Ваш код входа ByggExp:",
    expires:
      "Он действует 15 минут. Если это были не вы, проигнорируйте это письмо.",
  }),
  fi: ({ name }) => ({
    subject: "ByggExp-kirjautumiskoodisi",
    hi: `Hei ${name},`,
    intro: "ByggExp-kirjautumiskoodisi:",
    expires:
      "Se vanhenee 15 minuutin kuluttua. Jos et pyytänyt tätä, voit jättää viestin huomiotta.",
  }),
  lt: ({ name }) => ({
    subject: "Jūsų ByggExp prisijungimo kodas",
    hi: `Sveiki, ${name},`,
    intro: "Jūsų ByggExp prisijungimo kodas:",
    expires:
      "Jis galioja 15 minučių. Jei to neprašėte, ignoruokite šį laišką.",
  }),
  lv: ({ name }) => ({
    subject: "Jūsu ByggExp pieteikšanās kods",
    hi: `Sveiki, ${name},`,
    intro: "Jūsu ByggExp pieteikšanās kods:",
    expires:
      "Tas ir derīgs 15 minūtes. Ja tas nebijāt jūs, ignorējiet šo e-pastu.",
  }),
  bs: ({ name }) => ({
    subject: "Vaš ByggExp kod za prijavu",
    hi: `Zdravo ${name},`,
    intro: "Vaš ByggExp kod za prijavu:",
    expires:
      "Ističe za 15 minuta. Ako niste vi to zatražili, ignorišite ovaj e-mail.",
  }),
};
