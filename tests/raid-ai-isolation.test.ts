/**
 * The Classic raid enemy AI (decision RA1, docs/CLASSIC_RAID_AI.md) changes raids only. Every other match type plays
 * byte-for-byte as before: bot play digests (state + event stream, `scripts/lib/modeDigests.ts`) of the 13 campaign
 * field missions at each level, the six boss missions, every Academy lesson, Classic and two City Rumble rulesets,
 * recorded on production 514be88 before that work. (Multiplayer is also pinned by tests/enemy-fairness.test.ts EF8,
 * the two normal matches by tests/mission-regression.test.ts.)
 */
import { describe, expect, it } from 'vitest';
import { arenaDigests, bossDigests, fieldDigests, lessonDigests } from '../scripts/lib/modeDigests';

describe('RA1: everything but a raid is untouched by the raid AI', () => {
  it('the campaign field missions, every level', { timeout: 120_000 }, () => {
    expect(fieldDigests()).toEqual({
      'oshodi.approach/easy': '1e267ac2:20170/4febbcaf',
      'oshodi.approach/normal': 'b37b0a7e:20231/a23ebe6a',
      'oshodi.approach/hard': 'e4349fc1:20211/a6c2d880',
      'oshodi.railEdge/easy': 'a45683d3:26618/861495b0',
      'oshodi.railEdge/normal': '2cdee9c5:26850/96c232dc',
      'oshodi.railEdge/hard': '1b8035d5:26850/6c0f3296',
      'mushin.approach/easy': 'f492be7d:19995/bf15f541',
      'mushin.approach/normal': '5de74ff5:19994/bf15f541',
      'mushin.approach/hard': '4f82c0dc:20005/bf15f541',
      'mushin.market/easy': '2107cf16:27239/62e2f65b',
      'mushin.market/normal': '93f68408:27473/6cb9dcc6',
      'mushin.market/hard': 'd0abc092:27484/5b04d7d0',
      'fadeyiSomolu.approach/easy': '9df67296:20059/5df4d529',
      'fadeyiSomolu.approach/normal': '87cefc28:20053/5df4d529',
      'fadeyiSomolu.approach/hard': 'e6cf4d7a:20072/5df4d529',
      'fadeyiSomolu.junctions/easy': 'b747d2ac:26413/2e9ccf66',
      'fadeyiSomolu.junctions/normal': 'a8edd8ae:26707/56e726f4',
      'fadeyiSomolu.junctions/hard': '3487b5ae:26434/e2793167',
      'ebuteMetta.approach/easy': 'b43560d:31822/5e4935ed',
      'ebuteMetta.approach/normal': '311d8cef:32213/e595f290',
      'ebuteMetta.approach/hard': 'fd47c058:30961/8f3006fd',
      'lagosIsland.approach/easy': '69cb4a10:25454/5249d2ba',
      'lagosIsland.approach/normal': 'a54e68d8:25452/e833da4b',
      'lagosIsland.approach/hard': '38b11962:25457/1aa5e9db',
      'lagosIsland.press/easy': 'c15abfdc:25506/6eeb22e9',
      'lagosIsland.press/normal': '960838ff:25352/a2733289',
      'lagosIsland.press/hard': '5e4b2a28:25369/6d927e62',
      'lekki.approach/easy': '1aa13458:23202/cd50e3ad',
      'lekki.approach/normal': '15bc35ac:27713/c2d75d7',
      'lekki.approach/hard': '899a4f4c:27498/870d18ed',
      'lekki.estate/easy': '947cc6ca:29535/af91067a',
      'lekki.estate/normal': 'c5e2a683:29669/442b9d9e',
      'lekki.estate/hard': '2c57efd3:25973/3bdfa78a',
      'ojuelegba.return/easy': 'b53a8fd0:20461/a5304576',
      'ojuelegba.return/normal': '3cf6cf18:20464/f949389f',
      'ojuelegba.return/hard': '92e0c1:20193/a942c297',
      'ojuelegba.junction/easy': 'a4e96e75:24991/c122f8c0',
      'ojuelegba.junction/normal': '5ad9e49:24997/a67b5a2',
      'ojuelegba.junction/hard': '29beb616:25011/8c639193',
    });
  });

  it('the boss missions (Hard), the Academy lessons, Classic and City Rumble', { timeout: 120_000 }, () => {
    expect(bossDigests()).toEqual({
      oshodi: '5bf33fbf:25547/fa20367d',
      mushin: '965d1df7:22647/e0c25ef7',
      fadeyiSomolu: 'e42a0de0:19116/5fe97435',
      ebuteMetta: '2eb8a1f6:22305/674efe19',
      lagosIsland: 'dac31d21:21677/d17df831',
      lekki: '73c7dd07:23188/9153e154',
    });
    expect(lessonDigests()).toEqual({
      move: '988fb52c:3099/7b7623b9',
      place: 'e9eb7667:3099/9dceb5d0',
      escape: '74ec26bd:3101/f642b954',
      cross: 'a061d223:4879/fc460bb6',
      safety: '3e0c096b:3099/b49fed4c',
      multiple: '1fd5f994:3107/2da75b48',
      range: 'bd5005bd:3101/8f826430',
      square: '5c0c5360:3100/2cb74773',
      protection: 'a7ac3bd1:3107/45eed3c',
      kick: 'bf046628:3101/13595451',
      punch: 'bd3ada64:3104/c3b52b5',
      disarm: 'de1f36d:4890/15a53bae',
      pass: 'b54b6f1e:3103/51e2ddd4',
      remote: 'c2092214:3096/ec359525',
      melee: '3ac2fefe:5952/6925a5e',
      vehicle: 'e9d55936:6435/5ccff665',
      crush: 'db978699:4303/758c9861',
      survival: 'a7b88317:6933/77430806',
      deathmatch: '54058f9c:7848/90f065d',
      team: 'fc5c17b9:9462/41627717',
      'trap-agbero': '7b46f5aa:6849/2f24b181',
      'trap-thrower': '2f05b2f5:6954/a5e02455',
      'trap-hidden': '7b46f5aa:6849/2f24b181',
    });
    expect(arenaDigests()).toEqual({
      classic: '566aead9:8707/db95e757',
      rumbleSurvival: 'c82ed6f0:23602/329b055',
      rumbleTeam: 'c26211e0:25438/9caf1414',
    });
  });
});
