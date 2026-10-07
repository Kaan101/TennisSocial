-- Geçici demo girişleri (WTA isimleri): *@tennisclub.local, parola Tenis1234 (argon2id).
-- Merdiven sırası: boş merdivende 1–20; mevcut oyuncu varsa listenin sonuna eklenir.

INSERT INTO "User" ("id", "email", "passwordHash", "role", "boardVisible", "createdAt", "updatedAt")
SELECT v.id, v.email, v.password_hash, 'MEMBER'::"Role", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('pro-ladder-user-01'::text, 'iga.swiatek@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-02'::text, 'aryna.sabalenka@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-03'::text, 'coco.gauff@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-04'::text, 'naomi.osaka@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-05'::text, 'ashleigh.barty@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-06'::text, 'serena.williams@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-07'::text, 'simona.halep@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-08'::text, 'elena.rybakina@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-09'::text, 'ons.jabeur@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-10'::text, 'caroline.wozniacki@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-11'::text, 'garbine.muguruza@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-12'::text, 'angelique.kerber@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-13'::text, 'petra.kvitova@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-14'::text, 'victoria.azarenka@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-15'::text, 'jessica.pegula@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-16'::text, 'barbora.krejcikova@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-17'::text, 'marketa.vondrousova@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-18'::text, 'madison.keys@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-19'::text, 'qinwen.zheng@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text),
    ('pro-ladder-user-20'::text, 'jasmine.paolini@tennisclub.local'::text, '$argon2id$v=19$m=65536,p=4,t=3$A2sQNQE8JBpzDULopBRMkg$CERESEEtT+CZANZWIKparUO+LnNv9rBwwq+3IAd73ZY'::text)
) AS v(id, email, password_hash)
WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."email" = v.email);

INSERT INTO "Profile" (
  "id", "userId", "firstName", "lastName", "phone", "whatsapp", "city", "personProfile", "bio", "createdAt", "updatedAt"
)
SELECT
  v.profile_id,
  u."id",
  v.first_name,
  v.last_name,
  v.phone,
  v.whatsapp,
  'İstanbul',
  'OYUNCU'::"PersonProfile",
  'Merdiven demo hesabı.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  VALUES
    ('pro-ladder-profile-01'::text, 'iga.swiatek@tennisclub.local'::text, 'Iga'::text, 'Świątek'::text, '+90 555 020 00 01'::text, '+905550200001'::text, 1),
    ('pro-ladder-profile-02'::text, 'aryna.sabalenka@tennisclub.local'::text, 'Aryna'::text, 'Sabalenka'::text, '+90 555 020 00 02'::text, '+905550200002'::text, 2),
    ('pro-ladder-profile-03'::text, 'coco.gauff@tennisclub.local'::text, 'Coco'::text, 'Gauff'::text, '+90 555 020 00 03'::text, '+905550200003'::text, 3),
    ('pro-ladder-profile-04'::text, 'naomi.osaka@tennisclub.local'::text, 'Naomi'::text, 'Osaka'::text, '+90 555 020 00 04'::text, '+905550200004'::text, 4),
    ('pro-ladder-profile-05'::text, 'ashleigh.barty@tennisclub.local'::text, 'Ashleigh'::text, 'Barty'::text, '+90 555 020 00 05'::text, '+905550200005'::text, 5),
    ('pro-ladder-profile-06'::text, 'serena.williams@tennisclub.local'::text, 'Serena'::text, 'Williams'::text, '+90 555 020 00 06'::text, '+905550200006'::text, 6),
    ('pro-ladder-profile-07'::text, 'simona.halep@tennisclub.local'::text, 'Simona'::text, 'Halep'::text, '+90 555 020 00 07'::text, '+905550200007'::text, 7),
    ('pro-ladder-profile-08'::text, 'elena.rybakina@tennisclub.local'::text, 'Elena'::text, 'Rybakina'::text, '+90 555 020 00 08'::text, '+905550200008'::text, 8),
    ('pro-ladder-profile-09'::text, 'ons.jabeur@tennisclub.local'::text, 'Ons'::text, 'Jabeur'::text, '+90 555 020 00 09'::text, '+905550200009'::text, 9),
    ('pro-ladder-profile-10'::text, 'caroline.wozniacki@tennisclub.local'::text, 'Caroline'::text, 'Wozniacki'::text, '+90 555 020 00 10'::text, '+905550200010'::text, 10),
    ('pro-ladder-profile-11'::text, 'garbine.muguruza@tennisclub.local'::text, 'Garbiñe'::text, 'Muguruza'::text, '+90 555 020 00 11'::text, '+905550200011'::text, 11),
    ('pro-ladder-profile-12'::text, 'angelique.kerber@tennisclub.local'::text, 'Angelique'::text, 'Kerber'::text, '+90 555 020 00 12'::text, '+905550200012'::text, 12),
    ('pro-ladder-profile-13'::text, 'petra.kvitova@tennisclub.local'::text, 'Petra'::text, 'Kvitová'::text, '+90 555 020 00 13'::text, '+905550200013'::text, 13),
    ('pro-ladder-profile-14'::text, 'victoria.azarenka@tennisclub.local'::text, 'Victoria'::text, 'Azarenka'::text, '+90 555 020 00 14'::text, '+905550200014'::text, 14),
    ('pro-ladder-profile-15'::text, 'jessica.pegula@tennisclub.local'::text, 'Jessica'::text, 'Pegula'::text, '+90 555 020 00 15'::text, '+905550200015'::text, 15),
    ('pro-ladder-profile-16'::text, 'barbora.krejcikova@tennisclub.local'::text, 'Barbora'::text, 'Krejčíková'::text, '+90 555 020 00 16'::text, '+905550200016'::text, 16),
    ('pro-ladder-profile-17'::text, 'marketa.vondrousova@tennisclub.local'::text, 'Markéta'::text, 'Vondroušová'::text, '+90 555 020 00 17'::text, '+905550200017'::text, 17),
    ('pro-ladder-profile-18'::text, 'madison.keys@tennisclub.local'::text, 'Madison'::text, 'Keys'::text, '+90 555 020 00 18'::text, '+905550200018'::text, 18),
    ('pro-ladder-profile-19'::text, 'qinwen.zheng@tennisclub.local'::text, 'Qinwen'::text, 'Zheng'::text, '+90 555 020 00 19'::text, '+905550200019'::text, 19),
    ('pro-ladder-profile-20'::text, 'jasmine.paolini@tennisclub.local'::text, 'Jasmine'::text, 'Paolini'::text, '+90 555 020 00 20'::text, '+905550200020'::text, 20)
) AS v(profile_id, email, first_name, last_name, phone, whatsapp, sort_order)
JOIN "User" u ON u."email" = v.email
WHERE NOT EXISTS (SELECT 1 FROM "Profile" p WHERE p."userId" = u."id");

INSERT INTO "PrivacySetting" ("id", "userId", "createdAt", "updatedAt")
SELECT v.privacy_id, u."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('pro-ladder-privacy-01'::text, 'iga.swiatek@tennisclub.local'::text),
    ('pro-ladder-privacy-02'::text, 'aryna.sabalenka@tennisclub.local'::text),
    ('pro-ladder-privacy-03'::text, 'coco.gauff@tennisclub.local'::text),
    ('pro-ladder-privacy-04'::text, 'naomi.osaka@tennisclub.local'::text),
    ('pro-ladder-privacy-05'::text, 'ashleigh.barty@tennisclub.local'::text),
    ('pro-ladder-privacy-06'::text, 'serena.williams@tennisclub.local'::text),
    ('pro-ladder-privacy-07'::text, 'simona.halep@tennisclub.local'::text),
    ('pro-ladder-privacy-08'::text, 'elena.rybakina@tennisclub.local'::text),
    ('pro-ladder-privacy-09'::text, 'ons.jabeur@tennisclub.local'::text),
    ('pro-ladder-privacy-10'::text, 'caroline.wozniacki@tennisclub.local'::text),
    ('pro-ladder-privacy-11'::text, 'garbine.muguruza@tennisclub.local'::text),
    ('pro-ladder-privacy-12'::text, 'angelique.kerber@tennisclub.local'::text),
    ('pro-ladder-privacy-13'::text, 'petra.kvitova@tennisclub.local'::text),
    ('pro-ladder-privacy-14'::text, 'victoria.azarenka@tennisclub.local'::text),
    ('pro-ladder-privacy-15'::text, 'jessica.pegula@tennisclub.local'::text),
    ('pro-ladder-privacy-16'::text, 'barbora.krejcikova@tennisclub.local'::text),
    ('pro-ladder-privacy-17'::text, 'marketa.vondrousova@tennisclub.local'::text),
    ('pro-ladder-privacy-18'::text, 'madison.keys@tennisclub.local'::text),
    ('pro-ladder-privacy-19'::text, 'qinwen.zheng@tennisclub.local'::text),
    ('pro-ladder-privacy-20'::text, 'jasmine.paolini@tennisclub.local'::text)
) AS v(privacy_id, email)
JOIN "User" u ON u."email" = v.email
WHERE NOT EXISTS (SELECT 1 FROM "PrivacySetting" ps WHERE ps."userId" = u."id");

INSERT INTO "TennisProfile" ("id", "userId", "createdAt", "updatedAt")
SELECT v.tennis_id, u."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('pro-ladder-tennis-01'::text, 'iga.swiatek@tennisclub.local'::text),
    ('pro-ladder-tennis-02'::text, 'aryna.sabalenka@tennisclub.local'::text),
    ('pro-ladder-tennis-03'::text, 'coco.gauff@tennisclub.local'::text),
    ('pro-ladder-tennis-04'::text, 'naomi.osaka@tennisclub.local'::text),
    ('pro-ladder-tennis-05'::text, 'ashleigh.barty@tennisclub.local'::text),
    ('pro-ladder-tennis-06'::text, 'serena.williams@tennisclub.local'::text),
    ('pro-ladder-tennis-07'::text, 'simona.halep@tennisclub.local'::text),
    ('pro-ladder-tennis-08'::text, 'elena.rybakina@tennisclub.local'::text),
    ('pro-ladder-tennis-09'::text, 'ons.jabeur@tennisclub.local'::text),
    ('pro-ladder-tennis-10'::text, 'caroline.wozniacki@tennisclub.local'::text),
    ('pro-ladder-tennis-11'::text, 'garbine.muguruza@tennisclub.local'::text),
    ('pro-ladder-tennis-12'::text, 'angelique.kerber@tennisclub.local'::text),
    ('pro-ladder-tennis-13'::text, 'petra.kvitova@tennisclub.local'::text),
    ('pro-ladder-tennis-14'::text, 'victoria.azarenka@tennisclub.local'::text),
    ('pro-ladder-tennis-15'::text, 'jessica.pegula@tennisclub.local'::text),
    ('pro-ladder-tennis-16'::text, 'barbora.krejcikova@tennisclub.local'::text),
    ('pro-ladder-tennis-17'::text, 'marketa.vondrousova@tennisclub.local'::text),
    ('pro-ladder-tennis-18'::text, 'madison.keys@tennisclub.local'::text),
    ('pro-ladder-tennis-19'::text, 'qinwen.zheng@tennisclub.local'::text),
    ('pro-ladder-tennis-20'::text, 'jasmine.paolini@tennisclub.local'::text)
) AS v(tennis_id, email)
JOIN "User" u ON u."email" = v.email
WHERE NOT EXISTS (SELECT 1 FROM "TennisProfile" tp WHERE tp."userId" = u."id");

DO $$
DECLARE
  v_club_id TEXT;
  v_ladder_id TEXT;
  v_existing_count INT;
  v_base_rank INT;
  v_player RECORD;
  v_slot INT := 0;
BEGIN
  SELECT c."id"
  INTO v_club_id
  FROM "Club" c
  ORDER BY c."createdAt" ASC
  LIMIT 1;

  IF v_club_id IS NULL THEN
    v_club_id := 'club-dummy-bootstrap';
    INSERT INTO "Club" ("id", "name", "hasRestaurant", "hasFitness", "createdAt", "updatedAt")
    VALUES (v_club_id, 'Kulüp', false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  END IF;

  SELECT l."id"
  INTO v_ladder_id
  FROM "Ladder" l
  WHERE l."clubId" = v_club_id AND l."deletedAt" IS NULL
  ORDER BY l."createdAt" ASC
  LIMIT 1;

  IF v_ladder_id IS NULL THEN
    v_ladder_id := 'ladder-dummy-bootstrap';
    INSERT INTO "Ladder" (
      "id",
      "name",
      "clubId",
      "maxRankSpan",
      "showOfferingPlayer",
      "showChallengeResult",
      "acceptDays",
      "responseHours",
      "createdAt",
      "updatedAt"
    )
    VALUES (v_ladder_id, 'Merdiven', v_club_id, 3, true, true, 7, 48, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  END IF;

  SELECT COUNT(*)::INT
  INTO v_existing_count
  FROM "LadderPlayer" lp
  WHERE lp."ladderId" = v_ladder_id;

  IF v_existing_count > 0 THEN
    SELECT COALESCE(MAX(lp."rank"), 0)
    INTO v_base_rank
    FROM "LadderPlayer" lp
    WHERE lp."ladderId" = v_ladder_id;
  ELSE
    v_base_rank := 0;
  END IF;

  FOR v_player IN
    SELECT u."id" AS user_id, v.player_id, v.sort_order
    FROM (
      VALUES
        ('pro-ladder-player-01'::text, 'iga.swiatek@tennisclub.local'::text, 1),
        ('pro-ladder-player-02'::text, 'aryna.sabalenka@tennisclub.local'::text, 2),
        ('pro-ladder-player-03'::text, 'coco.gauff@tennisclub.local'::text, 3),
        ('pro-ladder-player-04'::text, 'naomi.osaka@tennisclub.local'::text, 4),
        ('pro-ladder-player-05'::text, 'ashleigh.barty@tennisclub.local'::text, 5),
        ('pro-ladder-player-06'::text, 'serena.williams@tennisclub.local'::text, 6),
        ('pro-ladder-player-07'::text, 'simona.halep@tennisclub.local'::text, 7),
        ('pro-ladder-player-08'::text, 'elena.rybakina@tennisclub.local'::text, 8),
        ('pro-ladder-player-09'::text, 'ons.jabeur@tennisclub.local'::text, 9),
        ('pro-ladder-player-10'::text, 'caroline.wozniacki@tennisclub.local'::text, 10),
        ('pro-ladder-player-11'::text, 'garbine.muguruza@tennisclub.local'::text, 11),
        ('pro-ladder-player-12'::text, 'angelique.kerber@tennisclub.local'::text, 12),
        ('pro-ladder-player-13'::text, 'petra.kvitova@tennisclub.local'::text, 13),
        ('pro-ladder-player-14'::text, 'victoria.azarenka@tennisclub.local'::text, 14),
        ('pro-ladder-player-15'::text, 'jessica.pegula@tennisclub.local'::text, 15),
        ('pro-ladder-player-16'::text, 'barbora.krejcikova@tennisclub.local'::text, 16),
        ('pro-ladder-player-17'::text, 'marketa.vondrousova@tennisclub.local'::text, 17),
        ('pro-ladder-player-18'::text, 'madison.keys@tennisclub.local'::text, 18),
        ('pro-ladder-player-19'::text, 'qinwen.zheng@tennisclub.local'::text, 19),
        ('pro-ladder-player-20'::text, 'jasmine.paolini@tennisclub.local'::text, 20)
    ) AS v(player_id, email, sort_order)
    JOIN "User" u ON u."email" = v.email
    ORDER BY v.sort_order
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM "LadderPlayer" lp
      WHERE lp."ladderId" = v_ladder_id AND lp."userId" = v_player.user_id
    ) THEN
      v_slot := v_slot + 1;
      INSERT INTO "LadderPlayer" ("id", "ladderId", "userId", "rank", "points", "createdAt", "updatedAt")
      VALUES (
        v_player.player_id,
        v_ladder_id,
        v_player.user_id,
        v_base_rank + v_slot,
        GREATEST(10, 120 - (v_base_rank + v_slot)),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      );
    END IF;
  END LOOP;
END $$;
