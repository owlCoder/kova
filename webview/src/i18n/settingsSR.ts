/** Strings of the in-chat Kova settings dialog (webview/src/components/SettingsDialog.tsx). */
export const settingsSR: Readonly<Record<string, string>> = {
  KOVA: 'KOVA',
  'Kova settings': 'Kova podešavanja',
  'Appearance & language': 'Izgled i jezik',
  Chat: 'Razgovor',
  English: 'Engleski',
  'Serbian Latin': 'Srpski (latinica)',
  German: 'Nemački',
  'Larger text across the whole Kova interface.': 'Veći tekst u celom Kova interfejsu.',
  Standard: 'Standardno',
  Larger: 'Najveće',
  'Where Kova opens': 'Gde se Kova otvara',
  'Chat opens here until you change it.': 'Razgovor se otvara ovde dok to ne promenite.',
  'Editor tab': 'Kartica uređivača',
  'Activity Bar sidebar': 'Bočna traka Activity Bar-a',
  'Context budget': 'Budžet konteksta',
  'Context budget (tokens)': 'Budžet konteksta (tokeni)',
  "Capped to the selected model's window.": 'Ograničeno na prozor izabranog modela.',
  'Reserved output tokens': 'Rezervisani tokeni za odgovor',
  'Kept for the answer; never more than a quarter of the window.':
    'Rezervisano za odgovor; nikad više od četvrtine prozora.',
  'Ollama context limit (tokens)': 'Ollama limit konteksta (tokeni)',
  'Local Ollama reserves memory for the whole window, so it keeps a lower cap.':
    'Lokalni Ollama rezerviše memoriju za ceo prozor, zato ima nižu granicu.',
  'Ollama base URL': 'Ollama osnovni URL',
  'Endpoint of the local Ollama runtime.': 'Adresa lokalnog Ollama okruženja.',
  'Default Ollama model': 'Podrazumevani Ollama model',
  'Model used for new conversations.': 'Model koji se koristi za nove razgovore.',
  'Stream model thinking': 'Prikazuj razmišljanje modela',
  'Show model reasoning separately; it is never saved in conversations.':
    'Razmišljanje modela se prikazuje posebno i nikad se ne čuva u razgovorima.',
  'Keep model alive (seconds)': 'Zadrži model u memoriji (sekunde)',
  'How long Ollama keeps the model in memory after a reply.':
    'Koliko dugo Ollama drži model u memoriji posle odgovora.',
  'Auto mode commands': 'Komande Auto režima',
  'Allowlisted commands': 'Dozvoljene komande',
  'One command per line, for example: git status. Auto mode runs these without asking.':
    'Jedna komanda po liniji, na primer: git status. Auto režim ih izvršava bez pitanja.',
  Cancel: 'Otkaži',
  'Save settings': 'Sačuvaj podešavanja',
  'Loading settings…': 'Učitavanje podešavanja…',
  'Settings saved.': 'Podešavanja su sačuvana.',
  'Settings did not load. Try opening them again.':
    'Podešavanja se nisu učitala. Pokušajte ponovo otvoriti.',
  'Settings were not saved. Try again.': 'Podešavanja nisu sačuvana. Pokušajte ponovo.',
};
