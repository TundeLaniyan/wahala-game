# District sectors: render cost, sector vs whole district

`node scripts/sector-perf.mjs all low,high --seconds=4` on SwiftShader (software WebGL, 4 shared cores), 740 x 360 at device scale 1, measured in play after the countdown (follow camera, enemies live). Each cell is "sector / whole district" (`?nosector`). Software rendering: these numbers compare the two variants on one machine; they are not phone timings.

| mission | quality | variant | build ms | draw calls | triangles | geometries | textures | frame mean ms | frame p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| oshodi.approach | low | sector | 3199 | 219 | 876210 | 246 | 181 | 796.9 | 1799.9 |
| oshodi.approach | low | whole district | 2317.7 | 205 | 1282342 | 295 | 188 | 498.5 | 1100 |
| oshodi.railEdge | low | sector | 1508.8 | 217 | 583606 | 286 | 180 | 371 | 783.2 |
| oshodi.railEdge | low | whole district | 1838 | 210 | 905937 | 292 | 178 | 641.4 | 1400 |
| mushin.approach | low | sector | 1903 | 200 | 633121 | 309 | 191 | 662.9 | 1516.7 |
| mushin.approach | low | whole district | 2378.2 | 185 | 738677 | 290 | 182 | 682 | 1550 |
| mushin.market | low | sector | 2538.1 | 165 | 550776 | 249 | 173 | 575.8 | 1299.9 |
| mushin.market | low | whole district | 2439.9 | 162 | 726299 | 289 | 182 | 637.5 | 1499.9 |
| fadeyiSomolu.approach | low | sector | 2678.5 | 188 | 476217 | 278 | 185 | 642.5 | 1616.7 |
| fadeyiSomolu.approach | low | whole district | 2207.6 | 185 | 578349 | 261 | 184 | 534.6 | 1366.6 |
| fadeyiSomolu.junctions | low | sector | 2082.4 | 198 | 505820 | 253 | 173 | 533.9 | 1116.6 |
| fadeyiSomolu.junctions | low | whole district | 2262.7 | 191 | 566616 | 264 | 183 | 673.1 | 1766.6 |
| ebuteMetta.approach | low | sector | 2089.5 | 192 | 690086 | 249 | 157 | 590.2 | 1383.3 |
| ebuteMetta.approach | low | whole district | 2438.3 | 199 | 942082 | 266 | 157 | 681.7 | 1483.2 |
| lagosIsland.approach | low | sector | 2655.3 | 251 | 670833 | 269 | 173 | 583.8 | 1316.7 |
| lagosIsland.approach | low | whole district | 2000.1 | 239 | 813396 | 292 | 176 | 669 | 1616.6 |
| lagosIsland.press | low | sector | 2695.2 | 226 | 661177 | 281 | 175 | 618.3 | 1466.6 |
| lagosIsland.press | low | whole district | 2478.8 | 211 | 716954 | 295 | 176 | 405.8 | 916.7 |
| lekki.approach | low | sector | 1805.2 | 273 | 513524 | 281 | 178 | 305.9 | 666.6 |
| lekki.approach | low | whole district | 1605.8 | 244 | 655016 | 279 | 177 | 314.1 | 700 |
| lekki.estate | low | sector | 1554.4 | 184 | 451682 | 274 | 178 | 341.8 | 750 |
| lekki.estate | low | whole district | 1325.4 | 177 | 505752 | 276 | 178 | 347.8 | 800 |
| oshodi.approach | high | sector | 1763.4 | 505 | 2204586 | 286 | 237 | 1235.2 | 3249.8 |
| oshodi.approach | high | whole district | 2036.5 | 506 | 3045230 | 332 | 290 | 943.6 | 1649.9 |
| oshodi.railEdge | high | sector | 1566.7 | 516 | 1584131 | 323 | 241 | 886.9 | 1966.6 |
| oshodi.railEdge | high | whole district | 2177.1 | 515 | 2695772 | 329 | 280 | 1146.6 | 2799.9 |
| mushin.approach | high | sector | 1935.6 | 563 | 2080995 | 346 | 265 | 794.1 | 2433.1 |
| mushin.approach | high | whole district | 1901.6 | 519 | 2221560 | 346 | 294 | 798.6 | 2250 |
| mushin.market | high | sector | 1666 | 539 | 1939613 | 321 | 284 | 892.5 | 2133.2 |
| mushin.market | high | whole district | 1924.7 | 532 | 2262680 | 345 | 294 | 846.6 | 1416.6 |
| fadeyiSomolu.approach | high | sector | 2043.4 | 503 | 2019281 | 287 | 250 | 744.1 | 2100 |
| fadeyiSomolu.approach | high | whole district | 1611.6 | 481 | 2403763 | 270 | 274 | 795.2 | 2266.6 |
| fadeyiSomolu.junctions | high | sector | 1753.4 | 457 | 1854416 | 264 | 253 | 802.8 | 1933.3 |
| fadeyiSomolu.junctions | high | whole district | 1479.8 | 470 | 2310576 | 273 | 273 | 1066.8 | 2783.1 |
| ebuteMetta.approach | high | sector | 2027.2 | 509 | 1977958 | 302 | 230 | 1023.3 | 2733.3 |
| ebuteMetta.approach | high | whole district | 1878.3 | 512 | 2481499 | 317 | 273 | 943.3 | 2183.3 |
| lagosIsland.approach | high | sector | 2399.9 | 575 | 2046014 | 292 | 247 | 1119.7 | 1599.9 |
| lagosIsland.approach | high | whole district | 1793.9 | 578 | 2540731 | 323 | 260 | 972.8 | 1966.6 |
| lagosIsland.press | high | sector | 1924.9 | 569 | 2126469 | 297 | 254 | 671.8 | 1899.9 |
| lagosIsland.press | high | whole district | 1605.8 | 566 | 2499941 | 326 | 260 | 1509.7 | 2349.9 |
| lekki.approach | high | sector | 2673.5 | 632 | 2009870 | 312 | 243 | 1356.6 | 3516.6 |
| lekki.approach | high | whole district | 2687.9 | 605 | 2303314 | 310 | 252 | 1490.5 | 2049.9 |
| lekki.estate | high | sector | 2762.3 | 514 | 1757226 | 299 | 243 | 1020.1 | 1500 |
| lekki.estate | high | whole district | 1986.4 | 490 | 1885060 | 299 | 253 | 800.1 | 2333.2 |

