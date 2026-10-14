# QR Image PWA

Application web progressive (HTML/CSS/JS, sans framework) qui :

- importe une image et l'enregistre dans **IndexedDB** ;
- génère automatiquement un **QR Code** associé ;
- permet de **télécharger** le QR Code (PNG) ;
- **scanne** le QR Code avec la caméra (ou depuis un fichier) ;
- retrouve et affiche l'image ;
- fonctionne **hors ligne** grâce au Service Worker.

## Lancer le projet

Le Service Worker et la caméra exigent `localhost` ou HTTPS (pas `file://`) :

```bash
npm start
```

Puis ouvrir http://localhost:8080. Aucune installation (`npm install`) n'est nécessaire.

Pour tester sur un téléphone, l'application doit être servie en HTTPS (voir « Déployer sur Vercel »).

## Déployer sur Vercel

`vercel.json` contient toute la configuration : `npm run build` copie la PWA dans `dist/`,
le dossier publié. Aucun réglage n'est nécessaire sur vercel.com (laisser *Root Directory* vide).

```bash
npx vercel --prod
```

ou importer le dépôt GitHub sur vercel.com.

`vercel.json` empêche aussi la mise en cache de `sw.js`, pour que les mises à jour arrivent sur
les téléphones. Après chaque modification, pensez à incrémenter `CACHE_VERSION` dans `sw.js`.

## Fonctionnement

L'image est **contenue dans le QR Code** sous forme d'aperçu compressé (WebP, ou JPEG sur Safari).
Un QR Code contient au plus ~3 Ko : l'aperçu fait donc environ 30 à 200 px selon l'image et
la qualité choisie (Basse / Moyenne / Haute). Plus la qualité est haute, plus le QR Code est dense
et difficile à scanner.

Le QR Code contient le lien `https://<hôte>/scanner.html#<id>.<format>.<image base64url>`.
Le fragment `#...` n'est jamais envoyé au réseau : la page du scanner, mise en cache par le
Service Worker, décode l'image **hors ligne**.

Lors d'un scan :
- si l'image a été enregistrée **sur cet appareil**, l'original en pleine qualité est lu dans IndexedDB ;
- sinon, l'aperçu contenu dans le QR Code est affiché, puis enregistré dans IndexedDB.

### Pour scanner avec un téléphone

1. Créer les QR Codes depuis l'adresse **HTTPS** de l'application (un QR Code créé depuis
   `localhost` contient un lien `localhost`, inutilisable par un autre appareil).
2. Ouvrir l'application **une fois en ligne** sur le téléphone (et l'installer) pour la mettre en cache.
3. Ensuite, hors ligne : ouvrir le scanner de l'application, ou scanner avec l'appareil photo
   du téléphone (le lien ouvre la page en cache, qui affiche l'image).

## Structure

| Fichier | Rôle |
|---|---|
| `index.html`, `js/app.js` | Import, enregistrement, génération du QR Code, galerie |
| `scanner.html`, `js/scanner.js` | Caméra / fichier, décodage, affichage de l'image |
| `js/database.js` | Accès IndexedDB (`saveImage`, `getImage`, `getAllImages`, `deleteImage`) |
| `js/qrcode.js` | Rendu et téléchargement du QR Code |
| `js/utils.js` | Format du QR Code, compression de l'aperçu, notifications, enregistrement du SW |
| `sw.js` | Cache de l'application (incrémenter `CACHE_VERSION` après modification) |
| `lib/` | [qrcodejs 1.0.0](https://github.com/davidshimjs/qrcodejs) (génération), [jsQR 1.4.0](https://github.com/cozmo/jsQR) (lecture, si le navigateur n'a pas de `BarcodeDetector` natif) |
| `scripts/` | `serve-pwa.js` (serveur local, `npm start`), `build-pwa.js` (`npm run build`) |
