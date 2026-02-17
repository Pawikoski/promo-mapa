# OLX Map

<p align="center">
  <img src="docs/preview.png" alt="Podglad dzialania OLX Map" width="1000" />
</p>

Szybki podgląd ofert OLX na mapie, bez wychodzenia ze strony wyszukiwania.

`OLX Map` dodaje przycisk **Mapa** na liście ofert i zamienia wyniki na interaktywny widok OpenStreetMap z miniaturkami, cenami i popupami ogłoszeń.

## Dlaczego warto

- Widzisz od razu **gdzie** są oferty, a nie tylko listę.
- Szybko porównujesz ogłoszenia po **lokalizacji i cenie**.

## Najważniejsze funkcje

- Przycisk **Mapa** na liście ofert obok przycisku „Obserwuj wyszukiwanie”.
- Duży modal z mapą OpenStreetMap.
- Markery z miniaturkami zdjęć ofert.
- Popup oferty:
  - większe zdjęcie,
  - cena + lokalizacja,
  - tytuł (klik otwiera ofertę),
  - krótki opis.
- Przełączniki:
  - **grupuj** (cluster + spiderfy dla ofert w tym samym miejscu),
  - **kolor cen** (zielony dla tańszych, czerwony dla droższych).


## Szybki start

1. Zainstaluj zależności:
   ```bash
   npm install
   ```
2. Zbuduj paczkę:
   ```bash
   npm run build
   ```
3. W Chrome otwórz `chrome://extensions`.
4. Włącz **Tryb dewelopera**.
5. Kliknij **Wczytaj rozpakowane** i wskaż katalog repo.

Gotowe. Wejdź na `olx.pl`, otwórz listę ofert i kliknij **Mapa**.

## Uwaga

Projekt jest nieoficjalny i niezwiązany z OLX.  
Działa na aktualnej strukturze UI/API OLX, która może się zmieniać.
