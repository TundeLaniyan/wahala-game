# Voice recording script

> **Superseded (2026-10-24).** The line catalogue is now the founder's own voice plan
> (`tools/audio/voices/founder_manifest.json`, generated into `public/audio/voices/voices.json`) and the clips are
> added with `tools/audio/voices/import_voices.py`; see `docs/AUDIO.md` "Voice lines". The table below is the old
> catalogue, kept for reference only: none of these ids exists in the game any more.

Every crowd line in the catalogue (`public/audio/voices/voices.json`). **No audio is shipped for these lines**: the
synthetic placeholder voices were rejected and removed (see `docs/AUDIO.md`), so each line is silent until a
recording by a Nigerian speaker is added. Originally exported from the (removed) `tools/audiogen/` script; edit
`voices.json` and this table together.

Recording and integration steps: `public/audio/voices/recorded/README.md`.

Direction: ordinary people in a busy Lagos bus park / market, not announcers. Vary age, gender and region of
accent across speakers; reactions are shouted or exclaimed over noise, ambient lines are conversational.

## Gameplay reactions

| Clip id | Category | When it plays | Line |
| --- | --- | --- | --- |
| `r_match_start_0` | match_start | the match begins | Oya! Make we see wetin dey happen! |
| `r_match_start_1` | match_start | the match begins | Ehen! Wahala don start! |
| `r_match_start_2` | match_start | the match begins | Come, come, come! Dem don begin! |
| `r_match_start_3` | match_start | the match begins | Abeg, make we start! |
| `r_gen_placed_0` | gen_placed | someone puts down a generator | Ah! Wetin be this one? |
| `r_gen_placed_1` | gen_placed | someone puts down a generator | Oga, e don put generator o! |
| `r_gen_placed_2` | gen_placed | someone puts down a generator | Ehen, see am! |
| `r_gen_placed_3` | gen_placed | someone puts down a generator | Abeg, who put that thing for there? |
| `r_fuse_0` | fuse | a generator next to the player is about to blow (shouted warning) | Run! Run! E go blow! |
| `r_fuse_1` | fuse | a generator next to the player is about to blow (shouted warning) | Oga, shift! Shift from there! |
| `r_fuse_2` | fuse | a generator next to the player is about to blow (shouted warning) | Chai! The generator don dey go! |
| `r_fuse_3` | fuse | a generator next to the player is about to blow (shouted warning) | Abeg, move! Make e no catch you! |
| `r_fuse_4` | fuse | a generator next to the player is about to blow (shouted warning) | Ah! E don almost blow! |
| `r_escape_0` | escape | the player escapes a blast / a near miss | Omo! See as e take escape! |
| `r_escape_1` | escape | the player escapes a blast / a near miss | Ah! E no touch am! |
| `r_escape_2` | escape | the player escapes a blast / a near miss | Oya! You sabi run o! |
| `r_escape_3` | escape | the player escapes a blast / a near miss | God dey! Na by inch! |
| `r_escape_4` | escape | the player escapes a blast / a near miss | Chai! That one na close shave! |
| `r_escape_5` | escape | the player escapes a blast / a near miss | Ah! E nearly catch am! |
| `r_elim_bot_0` | elim_bot | an opponent is eliminated (blast) | Ah! You don finish am! |
| `r_elim_bot_1` | elim_bot | an opponent is eliminated (blast) | Ehen! That one don go! |
| `r_elim_bot_2` | elim_bot | an opponent is eliminated (blast) | See calculation! This guy wicked! |
| `r_elim_bot_3` | elim_bot | an opponent is eliminated (blast) | Oya! One don comot! |
| `r_elim_bot_4` | elim_bot | an opponent is eliminated (blast) | E don do! Na so e end! |
| `r_elim_human_0` | elim_human | the player is eliminated (blast) | Chai! Oga don waka! |
| `r_elim_human_1` | elim_human | the player is eliminated (blast) | Ah ah! Sorry o! |
| `r_elim_human_2` | elim_human | the player is eliminated (blast) | Wetin be that one? E don finish! |
| `r_elim_human_3` | elim_human | the player is eliminated (blast) | Haa! You don burst! |
| `r_elim_human_4` | elim_human | the player is eliminated (blast) | Abeg, no vex! Try again! |
| `r_danfo_0` | danfo | a Danfo attacks (launch / warning / near miss / eliminates someone) | Chai! That Danfo don carry am go! |
| `r_danfo_1` | danfo | a Danfo attacks (launch / warning / near miss / eliminates someone) | Danfo! Danfo! Shift! Shift! |
| `r_danfo_2` | danfo | a Danfo attacks (launch / warning / near miss / eliminates someone) | Oga, where you dey run go? |
| `r_danfo_3` | danfo | a Danfo attacks (launch / warning / near miss / eliminates someone) | See Danfo o! E no get brake! |
| `r_taxi_0` | taxi | a taxi attacks (same triggers) | Yellow taxi dey come o! |
| `r_taxi_1` | taxi | a taxi attacks (same triggers) | Taxi! Taxi! Abeg, move! |
| `r_taxi_2` | taxi | a taxi attacks (same triggers) | Ah! That taxi dey craze! |
| `r_taxi_3` | taxi | a taxi attacks (same triggers) | Where this taxi dey go? |
| `r_keke_0` | keke | a Keke attacks (same triggers) | Keke dey come! Keke dey come! |
| `r_keke_1` | keke | a Keke attacks (same triggers) | Ah! Keke don turn! |
| `r_keke_2` | keke | a Keke attacks (same triggers) | Chai! Napep dey fly o! |
| `r_keke_3` | keke | a Keke attacks (same triggers) | Oga, abeg, Keke dey your back! |
| `r_vehicle_destroyed_0` | vehicle_destroyed | a vehicle is destroyed | Ah ah! Dem don scatter the motor! |
| `r_vehicle_destroyed_1` | vehicle_destroyed | a vehicle is destroyed | Wahala! The motor don burst! |
| `r_vehicle_destroyed_2` | vehicle_destroyed | a vehicle is destroyed | Na the generator scatter am o! |
| `r_vehicle_destroyed_3` | vehicle_destroyed | a vehicle is destroyed | Chai! No more motor! |
| `r_okada_save_0` | okada_save | the player's Okada takes a lethal hit and saves them | Okada save am! Na so e dey go! |
| `r_okada_save_1` | okada_save | the player's Okada takes a lethal hit and saves them | Ah! The Okada take the wahala for am! |
| `r_okada_save_2` | okada_save | the player's Okada takes a lethal hit and saves them | Omo! That Okada na hero! |
| `r_okada_break_0` | okada_break | an opponent's Okada is destroyed | Chai! Okada don die! |
| `r_okada_break_1` | okada_break | an opponent's Okada is destroyed | Ah! The Okada don scatter! |
| `r_okada_break_2` | okada_break | an opponent's Okada is destroyed | Okada don finish o! |
| `r_final_0` | final | the last 30 seconds begin / the last 10 seconds | Time dey go o! Oya, oya! |
| `r_final_1` | final | the last 30 seconds begin / the last 10 seconds | Make una hurry! Time don near finish! |
| `r_final_2` | final | the last 30 seconds begin / the last 10 seconds | Oga, finish am before time go! |
| `r_final_3` | final | the last 30 seconds begin / the last 10 seconds | Last minute! Wahala dey! |
| `r_win_0` | win | the player wins | Ehen! Na you be the oga! |
| `r_win_1` | win | the player wins | Winner! Winner! Congratulations o! |
| `r_win_2` | win | the player wins | Chai! You don win o! |
| `r_win_3` | win | the player wins | Na you biggest! Well done! |
| `r_lose_0` | lose | the player loses | Ah! Sorry o! Better luck next time! |
| `r_lose_1` | lose | the player loses | E don do! Try again, my man! |
| `r_lose_2` | lose | the player loses | Chai! The other one don win! |
| `r_draw_0` | draw | the match is a draw | Haa! Nobody win! |
| `r_draw_1` | draw | the match is a draw | Wetin be this one? Both of dem don die! |
| `r_draw_2` | draw | the match is a draw | Na draw be that! Wahala! |
| `r_kicked_0` | kicked | a generator is kicked or thrown | Oga, why you kick am? |
| `r_kicked_1` | kicked | a generator is kicked or thrown | Ah! See as e throw am! |
| `r_kicked_2` | kicked | a generator is kicked or thrown | Who dey throw generator like that? |
| `r_pickup_0` | pickup | the player grabs a rare pickup | Ehen! Lucky guy! |
| `r_pickup_1` | pickup | the player grabs a rare pickup | Oga, you don get am! |
| `r_pickup_2` | pickup | the player grabs a rare pickup | Ah! See as e carry am! |
| `r_pushed_0` | pushed | someone is pushed | Ah! Why you push am? |
| `r_pushed_1` | pushed | someone is pushed | Oga, you no get respect? |
| `r_pushed_2` | pushed | someone is pushed | Hey! Abeg, no push me! |
| `r_thrown_0` | thrown | a bottle / firecracker is thrown from the crowd | Who dey throw bottle? |
| `r_thrown_1` | thrown | a bottle / firecracker is thrown from the crowd | Ah! Firecracker! Abeg, stop! |
| `r_thrown_2` | thrown | a bottle / firecracker is thrown from the crowd | Hey! Na who do that one? |
| `r_crush_0` | crush | a block crushes down on the arena | Chai! E don fall o! |
| `r_crush_1` | crush | a block crushes down on the arena | Ah! Watch out! |
| `r_crush_2` | crush | a block crushes down on the arena | Abeg, be careful o! |
| `r_hazard_0` | hazard | someone hits a pothole or oil | Ah! Pothole! Na Lagos road! |
| `r_hazard_1` | hazard | someone hits a pothole or oil | E don slip! Na oil! |
| `r_hazard_2` | hazard | someone hits a pothole or oil | Chai! Lagos road no be joke! |
| `r_dazed_0` | dazed | someone is dazed | Ah! Him head don turn! |
| `r_dazed_1` | dazed | someone is dazed | Abeg, wake up! Wahala dey! |

## Street conversations and calls (ambient)

Scenes are played line after line by DIFFERENT speakers; `call` scenes are shouted from a distance.

| Clip id | Scene | Kind | Line |
| --- | --- | --- | --- |
| `a_shift_0` | shift | talk | Oga, abeg shift small! |
| `a_shift_1` | shift | talk | Ah ah! Where you wan make I go? |
| `a_shift_2` | shift | talk | Abeg, make I pass! |
| `a_side_0` | side | talk | Wetin dey happen for that side? |
| `a_side_1` | side | talk | I no know o. Na fight dem dey fight. |
| `a_bargain1_0` | bargain1 | talk | Aunty, how much you wan collect for this one? |
| `a_bargain1_1` | bargain1 | talk | Na two thousand naira. |
| `a_bargain1_2` | bargain1 | talk | Two thousand? You dey craze? Abeg, reduce am. |
| `a_bargain1_3` | bargain1 | talk | Oga, na last price be that. |
| `a_bargain2_0` | bargain2 | talk | How much be this one? |
| `a_bargain2_1` | bargain2 | talk | Na five hundred. |
| `a_bargain2_2` | bargain2 | talk | Abeg, add small. I go pay now now. |
| `a_call_ikeja_0` | call_ikeja | call | Ikeja! Ikeja! Ikeja! One more person! |
| `a_call_oshodi_0` | call_oshodi | call | Oshodi! Oshodi! Oshodi! Enter, enter! |
| `a_call_yaba_0` | call_yaba | call | Yaba! Yaba! Who dey go Yaba? |
| `a_call_island_0` | call_island | call | Obalende! Island! Island! Remain two! |
| `a_call_mile2_0` | call_mile2 | call | Mile two! Mile two! Straight! |
| `a_call_ikorodu_0` | call_ikorodu | call | Ikorodu! Ikorodu! Come, come, come! |
| `a_call_water_0` | call_water | call | Pure water! Pure water! Cold pure water! |
| `a_call_gala_0` | call_gala | call | Gala! Gala! Buy your gala here! |
| `a_call_suya_0` | call_suya | call | Suya! Suya don ready! Hot suya! |
| `a_call_bread_0` | call_bread | call | Agege bread! Hot bread! Come buy! |
| `a_change_0` | change | talk | Conductor, na who dey owe you change? |
| `a_change_1` | change | talk | Oga, I go give you. Wait small. |
| `a_argue1_0` | argue1 | talk | Na you wan kill me? |
| `a_argue1_1` | argue1 | talk | Abeg, no vex. I no see you. |
| `a_argue1_2` | argue1 | talk | You no get eye? |
| `a_argue2_0` | argue2 | talk | You wan fight me? |
| `a_argue2_1` | argue2 | talk | Oga, calm down. No be war. |
| `a_lagos_0` | lagos | talk | Which kain wahala be this? |
| `a_lagos_1` | lagos | talk | Na Lagos, my brother. |
| `a_tease_0` | tease | talk | Your wife go catch you o! |
| `a_tease_1` | tease | talk | Ha! Na you sabi! |
| `a_fuel_0` | fuel | talk | Dem say fuel don cost again. |
| `a_fuel_1` | fuel | talk | Na so e be. We go survive. |
| `a_come_see_0` | come_see | talk | Oya, make we go see wetin dey happen. |
| `a_come_see_1` | come_see | talk | Wait for me! |
| `a_driver_0` | driver | talk | Driver, abeg stop for front! |
| `a_driver_1` | driver | talk | Oga, wait! I never reach there. |
| `a_respect_0` | respect | talk | See this boy o! You no get respect? |
| `a_respect_1` | respect | talk | Sorry, sir. Na accident. |
| `a_goods_0` | goods | talk | Hey! No touch that o! Na my goods! |
| `a_goods_1` | goods | talk | Oga, I no touch am. |
| `a_gist_0` | gist | talk | Shey you hear wetin happen yesterday? |
| `a_gist_1` | gist | talk | Ah! Tell me everything! |
| `a_thanks_0` | thanks | talk | Madam, your change. |
| `a_thanks_1` | thanks | talk | Thank you o. God bless you. |
| `a_gen_loud_0` | gen_loud | talk | Ah! That generator loud o! |
| `a_gen_loud_1` | gen_loud | talk | Abeg, na so e dey. |
