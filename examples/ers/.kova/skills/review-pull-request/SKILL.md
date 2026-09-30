---
name: review-pull-request
description: Review an ERS change against requirements, architecture and observed test results.
---

# review-pull-request

## Svrha

Pregled jedne promene u odnosu na zahtev, Clean Architecture, SOLID i testove.

## Ulazi

- user story / issue i kriterijumi prihvatanja
- projektne instrukcije
- `git diff`
- rezultat testova

## Postupak

1. Sažmi očekivano ponašanje bez izmišljanja zahteva.
2. Proveri da li diff izlazi iz obima stavke.
3. Proveri smer zavisnosti: Domain ← Application ← Infrastructure/Presentation.
4. Proveri da li poslovna pravila cure u API/MCP/hook sloj.
5. Proveri negativne i granične scenarije.
6. Uporedi promenjeno ponašanje sa testovima.
7. Vrati nalaze po ozbiljnosti i navedi dokaz.

## Izlaz

- `blockingFindings`
- `nonBlockingFindings`
- `missingTests`
- `architectureNotes`
- `verificationEvidence`

## Ograničenja

- Ne menjaj kod.
- Ne predlaži potpuni rewrite kada je mala lokalna izmena dovoljna.
- Ne proglašavaj testove uspešnim bez stvarnog izlaza test alata.
