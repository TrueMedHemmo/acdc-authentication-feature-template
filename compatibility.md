# Compatibility Matrix
Please record your test experience here.
For each test describe:
* phone make and model
* environment
* test-case description including relevant preconditions/outcome
* general remarks
---
Measured timing from an Ad-Hoc build from:
* acdc-workspace: commit 03271f68f88d3e7473a75d12bc612d640ff08c0d
* acdc-authentication-feature-truemed: ---------
* acdc-ios-edge-agent: b423cbfd33f847d001b731a3514e5856af0e8285
* pharmaledger-camera: 2c9422b8781c8df49378d3df89e4e7a1c0b6f3b7
* Data collection amount: 500kb download / 1mb upload


| date      | C / B |   model   |   iOS   |   initial loading time   |   resp time(1) |  auth feature tm load. time   |  preview framerate(2) | gl framerate    | remarks                           |   tester    |
|-----------|-------|-----------|---------|--------------------------|----------------|-------------------------------|-----------------------|-----------------|-----------------------------------|-------------|
| 28 oct 21 | C     | 8         | 15.0.2  | -                        |  17.81s + 12s  |     1.52s                     |        25.17fps       |  Not Measured   | Short stall during capture        |   Hemmo     |
| 29 oct 21 | B     | 8         | 15.0.2  | -                        |  -             |     -                         |        -              |  Not Measured   | Crash if opened from pause        |   Hemmo     |
| 29 oct 21 | C     | 10        | 14.7.1  | -                        |  13.19s + 21s  |     1.52s                     |        25.64fps       |  Not Measured   | fluid                             |   Hemmo     |
| 29 oct 21 | B     | 10        | 14.7.1  | -                        |  13.09s + 12s  |     1.48s                     |        17.33fps       |  Not Measured   | short stall during capture        |   Hemmo     |
| 29 oct 21 | C     | 11        | -       | -                        |  -             |     -                         |        -              |  Not Measured   | -                                 |   Hemmo     |
| 29 oct 21 | B     | 11        | -       | -                        |  -             |     -                         |        -              |  Not Measured   | -                                 |   Hemmo     |
| 28 oct 21 | C     | 12        | 14.7.1  | -                        |  12.37s + 16s  |     1.08s                     |        70.67fps       |  Not Measured   | fluid                             |   Hemmo     |
| 29 oct 21 | B     | 12        | 15.0.1  | -                        |  12.35s + 10s  |     1.24s                     |        25.15fps       |  Not Measured   | fluid                             |   Hemmo     |
| 29 oct 21 | C     | 12        | 15.0.1  | -                        |  12.96s + 13s  |     1.58s                     |        35.71fps       |  Not Measured   | fluid                             |   Hemmo     |
| 29 oct 21 | B     | 12        | 14.7.1  | -                        |  11.41s + 19s  |     1.25s                     |        28.57fps       |  Not Measured   | fluid                             |   Hemmo     |
| 29 oct 21 | C     | 12 Pro    | 14.6.0  | -                        |  12.75s + 15s  |     1.45s                     |        57.20fps       |  Not Measured   | fluid                             |   Hemmo     |
| 29 oct 21 | B     | 12 Pro    | 14.6.0  | -                        |  11.53s + 12s  |     1.45s                     |        29.18fps       |  Not Measured   | fluid                             |   Hemmo     |
| 29 oct 21 | C     | 13        | 15.0.1  | -                        |  15.43s + 21s  |     1.74s                     |        56.14fps       |  Not Measured   | fluid                             |   Hemmo     |
| 29 oct 21 | B     | 13        | 15.0.1  | -                        |  11.08s + 12s  |     1.22s                     |        37.80fps       |  Not Measured   | fluid                             |   Hemmo     |
* ( C / B ): Cold start or from background
* (1): Interpreted as time-to-detect (i.e.: the time it takes to obtain positive authentication of the package), first number is data collection (taking 5 images), second number is TrueMed server-side AI's calculation time
* (2): Collecting preview capture callback's elapsedTime values and calculating an average
