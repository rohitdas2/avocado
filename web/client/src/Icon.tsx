type IconName = 'avocado' | 'food' | 'lifts' | 'settings' | 'plus' | 'trash' | 'search' | 'close';

export function Icon({ name }: { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'avocado' && <><path d="M12 2.5c-3.5 0-3.3 4.3-6.6 8.5C1 16.5 4.4 21.5 12 21.5S23 16.5 18.6 11C15.3 6.8 15.5 2.5 12 2.5Z" fill="currentColor" stroke="none" /><circle cx="12" cy="15" r="3.5" fill="var(--surface)" stroke="none" /></>}
    {name === 'food' && <><path d="M5 3v6m3-6v6M3.5 6h6M6.5 9v12M18.5 3v18m0-18c-4 3-4 10 0 10" /></>}
    {name === 'lifts' && <><path d="m8 16 8-8M3 12l9 9M12 3l9 9M2 16l6 6M16 2l6 6M4 13l9-9M11 20l9-9" /></>}
    {name === 'settings' && <><path d="m9 4 1-2h4l1 2 2 1 2-.3 2 3.5-1.4 1.6v2.4l1.4 1.6-2 3.5-2-.3-2 1-1 2h-4l-1-2-2-1-2 .3-2-3.5 1.4-1.6V9.8L3 8.2l2-3.5 2 .3Z" transform="translate(0 1)" /><circle cx="12" cy="12" r="3" /></>}
    {name === 'plus' && <path d="M12 5v14M5 12h14" />}
    {name === 'trash' && <><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></>}
    {name === 'search' && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>}
    {name === 'close' && <path d="m6 6 12 12M6 18 18 6" />}
  </svg>;
}
