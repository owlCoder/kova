const paths = {
  plus: 'M12 5v14M5 12h14',
  settings:
    'M10 3h4l.7 2.7 2.4 1.4 2.7-.7 2 3.4-2 2V14l2 2-2 3.4-2.7-.7-2.4 1.4L14 23h-4l-.7-2.9-2.4-1.4-2.7.7-2-3.4 2-2v-2.2l-2-2 2-3.4 2.7.7 2.4-1.4L10 3ZM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  paperclip: 'M8 13.5 15 6.5a3 3 0 0 1 4.2 4.2l-9 9a5 5 0 0 1-7.1-7.1l9-9M6 15.5l8-8',
  send: 'M12 19V5M5 12l7-7 7 7',
  stop: 'M7 7h10v10H7Z',
  close: 'M6 6l12 12M18 6 6 18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  code: 'M8 6l-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',
  review: 'M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 12h8M8 16h5',
  plan: 'M5 6h14M5 12h14M5 18h9',
  chevron: 'M9 5l7 7-7 7',
  warning: 'm12 3 10 18H2L12 3ZM12 9v5M12 17h.01',
} as const;

export function Icon({ name }: { readonly name: keyof typeof paths }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill={name === 'stop' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
