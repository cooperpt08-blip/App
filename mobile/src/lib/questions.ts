// The hair questions a customer answers before their photos.

export type Choice = { value: string; label: string };

export type HairAnswers = {
  texture: string;
  thickness: string;
  density: string;
  topLength: string;
  workAround: string[];
  look: string;
  stylingTime: string;
  cutFrequency: string;
};

export type Question = {
  id: keyof HairAnswers;
  label: string;
  help?: string;
  multi?: boolean; // true = they can pick more than one
  choices: Choice[];
};

export const emptyAnswers: HairAnswers = {
  texture: '',
  thickness: '',
  density: '',
  topLength: '',
  workAround: [],
  look: '',
  stylingTime: '',
  cutFrequency: '',
};

export const questions: Question[] = [
  {
    id: 'texture',
    label: 'What’s your hair texture?',
    choices: [
      { value: 'straight', label: 'Straight' },
      { value: 'wavy', label: 'Wavy' },
      { value: 'curly', label: 'Curly' },
      { value: 'coily', label: 'Coily' },
    ],
  },
  {
    id: 'thickness',
    label: 'How thick is each strand?',
    help: 'Roll one hair between your fingers. Can you barely feel it (fine) or does it feel like thread (coarse)?',
    choices: [
      { value: 'fine', label: 'Fine' },
      { value: 'medium', label: 'Medium' },
      { value: 'coarse', label: 'Coarse' },
    ],
  },
  {
    id: 'density',
    label: 'How much hair do you have?',
    help: 'Can you easily see your scalp when your hair is dry?',
    choices: [
      { value: 'thin', label: 'Not much' },
      { value: 'average', label: 'Average' },
      { value: 'thick', label: 'A lot' },
    ],
  },
  {
    id: 'topLength',
    label: 'How long is it on top right now?',
    choices: [
      { value: 'buzzed (under 1/2 inch)', label: 'Buzzed (under ½ in)' },
      { value: 'short (1/2 to 2 inches)', label: 'Short (½ to 2 in)' },
      { value: 'medium (2 to 4 inches)', label: 'Medium (2 to 4 in)' },
      { value: 'long (4 inches or more)', label: 'Long (4 in or more)' },
    ],
  },
  {
    id: 'workAround',
    label: 'Anything we should work around?',
    help: 'Pick all that apply, or skip.',
    multi: true,
    choices: [
      { value: 'cowlick', label: 'Cowlick' },
      { value: 'receding hairline', label: 'Receding hairline' },
      { value: 'thinning', label: 'Thinning' },
      { value: 'wears glasses', label: 'Glasses' },
      { value: 'has a beard', label: 'Beard' },
    ],
  },
  {
    id: 'look',
    label: 'What look are you going for?',
    choices: [
      { value: 'clean and professional', label: 'Clean & professional' },
      { value: 'modern and trendy', label: 'Modern & trendy' },
      { value: 'low maintenance', label: 'Low maintenance' },
      { value: 'textured and messy', label: 'Textured & messy' },
      { value: 'bold', label: 'Bold / statement' },
    ],
  },
  {
    id: 'stylingTime',
    label: 'How long will you spend styling each day?',
    choices: [
      { value: 'none, wash and go', label: 'None, wash and go' },
      { value: 'under 5 minutes', label: 'Under 5 min' },
      { value: '5 to 10 minutes', label: '5 to 10 min' },
      { value: 'over 10 minutes', label: '10+ min' },
    ],
  },
  {
    id: 'cutFrequency',
    label: 'How often do you get a haircut?',
    choices: [
      { value: 'every 2 weeks', label: 'Every 2 weeks' },
      { value: 'every 3 to 4 weeks', label: 'Every 3 to 4 weeks' },
      { value: 'every 1 to 2 months', label: 'Every 1 to 2 months' },
      { value: 'every few months', label: 'Every few months' },
    ],
  },
];
