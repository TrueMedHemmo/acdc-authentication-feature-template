# TrueMed Pharmaledger Demo Authentication Feature

This repository is to be used when building TrueMed's Authentication Feature for the PharmaLedger EPI, to be integrated within the eLeaflet SSApp
(when defined on batch commissioning)

This repository is only useful within the acdc-workspace.

Setup and build:
- Make sure that the octopus.json of the acdc-workspace has the TrueMed auth feature set.
    - This should already be the case automatically.
- Acquire API key from TrueMed contact person and set it in HomeController.js (line 7, cost variable apiKey)

Testing:
- Add three separate product batches with following serial codes, with the TrueMed-corresponding ACDC-generated seed value as authentication feature:
    - 123
    - 456
    - 789
- Scanning one of these test code batches created with the following serials should open up with TrueMed's authentication feature
- Take 5 images as instructed
- System will automatically communicate with the TrueMed API
- Wait for result
- If redirected back to the product page, testing OK

