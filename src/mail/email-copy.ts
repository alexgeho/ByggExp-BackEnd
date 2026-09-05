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
  | "lv";

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
    open: "Öppna länken nedan för att bekräfta din e-post och logga in automatiskt:",
    link: "Bekräfta e-post och logga in",
    later:
      "Du kan också logga in senare med din e-post — begär en engångskod i appen.",
    expires: "Denna länk går ut om 7 dagar.",
  }),
  nb: ({ name, roleLabel }) => ({
    subject: "Din invitasjon til ByggExp",
    hi: `Hei ${name},`,
    invited: `Du har blitt invitert til ByggExp som ${roleLabel}.`,
    open: "Åpne lenken nedenfor for å bekrefte e-posten din og logge inn automatisk:",
    link: "Bekreft e-post og logg inn",
    later:
      "Du kan også logge inn senere med e-posten din — be om en engangskode i appen.",
    expires: "Denne lenken utløper om 7 dager.",
  }),
  en: ({ name, roleLabel }) => ({
    subject: "Your ByggExp account invitation",
    hi: `Hi ${name},`,
    invited: `You have been invited to ByggExp as ${roleLabel}.`,
    open: "Open the link below to confirm your email and sign in automatically:",
    link: "Confirm email and sign in",
    later:
      "You can also sign in later with your email — request a one-time code in the app.",
    expires: "This link expires in 7 days.",
  }),
  pl: ({ name, roleLabel }) => ({
    subject: "Twoje zaproszenie do ByggExp",
    hi: `Cześć ${name},`,
    invited: `Zostałeś zaproszony do ByggExp jako ${roleLabel}.`,
    open: "Otwórz poniższy link, aby potwierdzić adres e-mail i zalogować się automatycznie:",
    link: "Potwierdź e-mail i zaloguj się",
    later:
      "Możesz też zalogować się później swoim adresem e-mail — poproś o jednorazowy kod w aplikacji.",
    expires: "Ten link wygasa za 7 dni.",
  }),
  et: ({ name, roleLabel }) => ({
    subject: "Sinu kutse ByggExpi",
    hi: `Tere ${name},`,
    invited: `Sind on kutsutud ByggExpi kui ${roleLabel}.`,
    open: "Ava allolev link, et kinnitada oma e-post ja logida automaatselt sisse:",
    link: "Kinnita e-post ja logi sisse",
    later:
      "Võid ka hiljem oma e-postiga sisse logida — küsi rakenduses ühekordset koodi.",
    expires: "See link aegub 7 päeva pärast.",
  }),
  uk: ({ name, roleLabel }) => ({
    subject: "Ваше запрошення до ByggExp",
    hi: `Вітаємо, ${name},`,
    invited: `Вас запросили до ByggExp як ${roleLabel}.`,
    open: "Відкрийте посилання нижче, щоб підтвердити електронну пошту й увійти автоматично:",
    link: "Підтвердити пошту та увійти",
    later:
      "Ви також можете увійти пізніше за своєю поштою — запросіть одноразовий код у застосунку.",
    expires: "Це посилання діє 7 днів.",
  }),
  ru: ({ name, roleLabel }) => ({
    subject: "Ваше приглашение в ByggExp",
    hi: `Здравствуйте, ${name},`,
    invited: `Вас пригласили в ByggExp как ${roleLabel}.`,
    open: "Откройте ссылку ниже, чтобы подтвердить эл. почту и войти автоматически:",
    link: "Подтвердить почту и войти",
    later:
      "Вы также можете войти позже по своей эл. почте — запросите одноразовый код в приложении.",
    expires: "Ссылка действительна 7 дней.",
  }),
  fi: ({ name, roleLabel }) => ({
    subject: "Kutsusi ByggExpiin",
    hi: `Hei ${name},`,
    invited: `Sinut on kutsuttu ByggExpiin roolilla ${roleLabel}.`,
    open: "Avaa alla oleva linkki vahvistaaksesi sähköpostisi ja kirjautuaksesi automaattisesti:",
    link: "Vahvista sähköposti ja kirjaudu",
    later:
      "Voit myös kirjautua myöhemmin sähköpostilla — pyydä kertakäyttökoodi sovelluksessa.",
    expires: "Tämä linkki vanhenee 7 päivän kuluttua.",
  }),
  lt: ({ name, roleLabel }) => ({
    subject: "Jūsų kvietimas į ByggExp",
    hi: `Sveiki, ${name},`,
    invited: `Jūs pakviestas į ByggExp kaip ${roleLabel}.`,
    open: "Atidarykite žemiau esančią nuorodą, kad patvirtintumėte el. paštą ir prisijungtumėte automatiškai:",
    link: "Patvirtinti el. paštą ir prisijungti",
    later:
      "Taip pat galite prisijungti vėliau su savo el. paštu — paprašykite vienkartinio kodo programėlėje.",
    expires: "Ši nuoroda galioja 7 dienas.",
  }),
  lv: ({ name, roleLabel }) => ({
    subject: "Jūsu ielūgums uz ByggExp",
    hi: `Sveiki, ${name},`,
    invited: `Jūs esat uzaicināts uz ByggExp kā ${roleLabel}.`,
    open: "Atveriet zemāk esošo saiti, lai apstiprinātu savu e-pastu un pieteiktos automātiski:",
    link: "Apstiprināt e-pastu un pieteikties",
    later:
      "Varat arī pieteikties vēlāk ar savu e-pastu — pieprasiet vienreizēju kodu lietotnē.",
    expires: "Šī saite ir derīga 7 dienas.",
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
};
