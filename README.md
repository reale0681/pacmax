# Pacmax

Pacmax è un piccolo gioco stile Pac-Man scritto in Node.js senza dipendenze esterne. Il server fornisce i file statici del gioco e un'API JSON per leggere e salvare la configurazione dei personaggi.

## Caratteristiche principali

- Editor in tempo reale per Pacman e per tutti i fantasmi (nome, colore e velocità).
- Salvataggio persistente della configurazione in `data/characters.json`.
- Un fantasma "Berserker" che, a differenza dell'originale, non diventa commestibile quando Pacman prende una super pillola, ma aumenta la propria velocità.
- Campo di gioco disegnato su canvas HTML5 con controlli da tastiera (frecce direzionali).

## Avvio

```bash
node server.js
```

Il server parte sulla porta `3000`. Apri [http://localhost:3000](http://localhost:3000) nel browser per giocare.

## Personalizzazione dei personaggi

1. Modifica i valori nel pannello "Modifica i personaggi" a destra del gioco.
2. Premi "Salva modifiche" per aggiornare il file di configurazione.
3. Le modifiche vengono applicate immediatamente al gioco senza dover riavviare il server.

Il file JSON può essere anche aggiornato manualmente (avendo cura di rispettare la struttura). Il server valida i dati garantendo che velocità e moltiplicatore Berserk siano in range corretti.
