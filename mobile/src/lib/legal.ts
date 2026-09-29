// Shape Up's Privacy Policy and Terms of Service, shown in the app.
//
// DRAFT: have a lawyer review both before launch. Fill in every [BRACKETED] item.
// Face photos can count as sensitive or biometric data in some places (for example
// Illinois, Texas, Washington, and the EU/UK), so the "Photos of your face" section
// especially needs a legal check against how the app actually works at launch.

export const LEGAL_CONTACT = '[CONTACT EMAIL]';
export const LEGAL_EFFECTIVE = '[EFFECTIVE DATE]';

export type LegalSection = { heading: string; paragraphs: string[] };

export const PRIVACY_POLICY: LegalSection[] = [
  {
    heading: 'Who we are',
    paragraphs: [
      `Shape Up is operated by [COMPANY LEGAL NAME] ("Shape Up", "we", "us"), based in [STATE/COUNTRY]. This policy explains what information the Shape Up app collects, how we use it, who can see it, and the choices you have. Questions: ${LEGAL_CONTACT}.`,
    ],
  },
  {
    heading: 'What we collect',
    paragraphs: [
      'Account details: your email address, password (stored scrambled, never readable by us), and first name.',
      'Your birthday (customers): hair changes with age, including strand thickness, density, and hairline, so we use your age to tailor haircut recommendations. We also use it to confirm you are old enough to use Shape Up. Barbershops do not see it.',
      'Hair details you give us: your answers about your hair (texture, thickness, length, things to work around, the look you want, styling time, how often you get cut) and any notes you write.',
      'Photos: the front and optional side photos you take for a recommendation, an optional profile photo, and photos you choose to send to your barbershop with a cut card. See "Photos of your face" below.',
      'Recommendations and cut cards: the haircuts recommended to you, and the cut cards you send to a barbershop.',
      'Appointments: the barbershop, barber, date and time of bookings you make, and whether they happened.',
      'Your barbershop link: which shop you joined by scanning its QR code, and any shops you shared your cut card code with.',
      'For barbers and shop owners: shop name and address, the name you show clients, your working hours and days off, appointment statuses, and notes you write about clients.',
      'Device information: a notification token so we can send you notifications, and your phone type (iPhone or Android). We do not collect your location, contacts, or advertising identifiers, and we do not track you across other apps or websites.',
    ],
  },
  {
    heading: 'Photos of your face',
    paragraphs: [
      'To recommend haircuts, the app needs a photo of your face and hair. Here is exactly what happens to face photos:',
      'Recommendation photos are sent securely to our AI provider (see "Who we share with") to create your recommendation. We do not keep them after your recommendation is ready.',
      'While you take a photo, the app may check it on your phone (for example, whether your whole face is in frame and the light is good). That check happens only on your device, and its results are not stored or sent to us.',
      'If you tap "Send to my barbershop" and agree to share your photo, it is stored privately and only that shop’s barbers can see it. It is deleted automatically 7 days after your appointment, or 30 days after you send it if there is no appointment.',
      'Your profile photo is optional. Only barbershops you use can see it. You can remove it at any time.',
      'We do not use your photos to identify you, we do not create face templates or face prints to recognize you, and we do not sell your photos or use them to train AI models.',
    ],
  },
  {
    heading: 'How we use your information',
    paragraphs: [
      'To run the app: create your account, make recommendations, send cut cards to the shop you choose, book appointments, and show barbers their schedule and clients.',
      'To send notifications you’ve allowed, such as appointment reminders and, for barbers, new bookings and cut cards.',
      'To keep limits fair (for example, how many recommendations you can get each month) and to prevent abuse.',
      'To show shops summary reports (for example, how many bookings they had) and to understand how Shape Up is used overall.',
      'We do not sell your personal information and we do not use it for advertising.',
    ],
  },
  {
    heading: 'Who can see your information',
    paragraphs: [
      'Your barbershop: the shop you link to can see your first name, profile photo (if you add one), cut cards you send them, photos you agree to share, your appointments with them, and notes their barbers write about you.',
      'Other barbershops: only if you show them your cut card code. They can then see your first name, profile photo, and the haircuts on your cut cards, but not other shops’ notes or appointment photos. You can remove a shop’s access at any time in the app.',
      'Other customers never see your information.',
    ],
  },
  {
    heading: 'Who we share with',
    paragraphs: [
      'We use a small number of service providers to run Shape Up. They may only use your information to provide their service to us:',
      'Supabase (database, accounts, and private photo storage).',
      'Anthropic (the Claude AI that creates recommendations from your photos and answers). [LEGAL REVIEW: confirm Anthropic’s current data retention and no-training terms for API customers and describe them here.]',
      'Expo (delivering notifications to your phone).',
      '[If added later: an image-generation provider for haircut previews, and an email provider.]',
      'We may also share information if the law requires it, to protect people’s safety, or as part of a sale or merger of our business (with notice to you).',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'Recommendation photos: deleted as soon as your recommendation is ready.',
      'Photos shared with a barbershop: deleted 7 days after the appointment, or 30 days after sending if no appointment was set.',
      'Everything else: kept while your account is open. When you delete your account, we delete your information, except where we must keep something by law.',
    ],
  },
  {
    heading: 'Your choices and rights',
    paragraphs: [
      'Delete your account: in the app, go to Settings, then Delete account. This permanently deletes your account, photos, recommendations, cut cards, and appointments.',
      'Remove your profile photo, cancel appointments, or remove a shop’s access to your cut cards at any time in the app.',
      'Turn notifications off in your phone’s settings.',
      `Ask us for a copy of your information, or to correct it, by emailing ${LEGAL_CONTACT}. Depending on where you live (for example California, the EU, or the UK), you may have additional rights, and you can contact us to use them.`,
    ],
  },
  {
    heading: 'Children',
    paragraphs: [
      'Shape Up is not meant for children under 13 [LEGAL REVIEW: consider 16 for the EU/UK], and we do not knowingly collect information from them. If you believe a child has given us information, contact us and we will delete it.',
    ],
  },
  {
    heading: 'Security',
    paragraphs: [
      'Your information is sent over encrypted connections. Access is limited by strict rules: for example, one barbershop can never see another shop’s clients or photos. No system is perfectly secure, but we work to protect your information and will tell you if a breach affects you, as the law requires.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'If we make important changes, we will tell you in the app before they take effect. The date at the top shows when this policy last changed.',
    ],
  },
];

export const TERMS_OF_SERVICE: LegalSection[] = [
  {
    heading: 'Agreement',
    paragraphs: [
      `These terms are an agreement between you and [COMPANY LEGAL NAME] ("Shape Up"). By creating an account or using the app, you agree to them and to our Privacy Policy. Questions: ${LEGAL_CONTACT}.`,
    ],
  },
  {
    heading: 'Your account',
    paragraphs: [
      'You must be at least 13 years old [LEGAL REVIEW] to use Shape Up. Give accurate information, keep your password private, and tell us if you think someone else is using your account. You are responsible for what happens under your account.',
    ],
  },
  {
    heading: 'Haircut recommendations are suggestions',
    paragraphs: [
      'Recommendations and previews are created by AI from your photos and answers. They are suggestions for you and your barber to consider, not guarantees of how a haircut will look. Your barber makes the final call on what works for your hair. Shape Up is not responsible for the result of any haircut.',
    ],
  },
  {
    heading: 'Barbershops and appointments',
    paragraphs: [
      'Barbershops on Shape Up are independent businesses, not part of Shape Up. They are responsible for their services, prices, hours, and how they handle your appointment. Shape Up only helps you share cut cards and book times.',
      'If you can’t make an appointment, please cancel in the app so someone else can book. Shops may have their own cancellation or no-show rules.',
    ],
  },
  {
    heading: 'For shop owners and barbers',
    paragraphs: [
      'Shop owners may be charged a subscription fee as agreed separately with Shape Up [add pricing and billing terms]. Owners are responsible for who they invite as barbers. Use clients’ information and photos only to serve those clients, keep it confidential, and follow applicable privacy laws. Do not download, copy, or share client photos outside the app.',
    ],
  },
  {
    heading: 'Acceptable use',
    paragraphs: [
      'Only upload photos of yourself, or of someone who has given you permission. Do not upload anything illegal, harmful, or sexual; do not try to access other people’s accounts or data; do not overload, reverse-engineer, or misuse the app. We may suspend or close accounts that break these rules.',
    ],
  },
  {
    heading: 'Your content',
    paragraphs: [
      'You keep ownership of your photos and notes. You give Shape Up permission to store and process them only to run the app for you, as described in the Privacy Policy.',
    ],
  },
  {
    heading: 'Deleting your account',
    paragraphs: [
      'You can delete your account at any time in Settings. If you own a shop, deleting your account also deletes the shop, its team links, its clients’ cut cards, and its bookings.',
    ],
  },
  {
    heading: 'Disclaimers and limits',
    paragraphs: [
      'Shape Up is provided "as is". To the extent the law allows, we do not promise the app will always be available or error-free, and our total liability to you is limited to the amount you paid us in the 12 months before the claim (or $50 if you paid nothing). [LEGAL REVIEW]',
    ],
  },
  {
    heading: 'Changes and contact',
    paragraphs: [
      'We may update these terms. If changes are important, we will tell you in the app before they take effect. These terms are governed by the laws of [STATE/COUNTRY]. [LEGAL REVIEW: dispute resolution.]',
    ],
  },
];
