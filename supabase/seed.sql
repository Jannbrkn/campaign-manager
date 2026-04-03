-- ============================================================
-- Seed: Agencies & Manufacturers
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- Agencies
INSERT INTO agencies (id, name, cost_center, ident_number, order_email) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Collezioni',           'Arredamenti UG (Finom Bank)',         'DE35 9277920', 'order@collezioni.eu'),
  ('a2000000-0000-0000-0000-000000000002', 'EMQuadrat',            'EMQuadrat (Qonto)',                   'DE45 2282288', 'order@collezioni.eu'),
  ('a3000000-0000-0000-0000-000000000003', 'Exclusive Collection', 'Exclusive Collection (HASPA)',        'DE27 4986739', 'order@exclusive-collection.eu'),
  ('a4000000-0000-0000-0000-000000000004', 'Design Collection',    'Design Collection',                  'DE27 4986739', 'order@design-collection.eu'),
  ('a5000000-0000-0000-0000-000000000005', 'vondomani',            'Vondomani',                          NULL,           'domenic@collezioni.eu');

-- ============================================================
-- Manufacturers — Collezioni (a1)
-- ============================================================
INSERT INTO manufacturers (agency_id, name, category, contact_person, postcard_frequency, postcard_months, postcard_format, newsletter_frequency, own_creatives, own_texts) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Röthlisberger',    'Möbel',        'Karo',         '2x pro Jahr', 'März, September',  'A5',     'Immer nach Postkarte', false, false),
  ('a1000000-0000-0000-0000-000000000001', 'Salvatori',        'Bad/Fliesen',  'Karo',         '2x pro Jahr', 'Februar, August',  'DIN Lang','Immer nach Postkarte', false, false),
  ('a1000000-0000-0000-0000-000000000001', 'Barovier & Toso',  'Licht',        'Annika/Merlin','1x pro Jahr', 'Oktober',          'A5',     'Immer nach Postkarte', false, false),
  ('a1000000-0000-0000-0000-000000000001', 'Promemoria',       'Möbel',        'Karo',         '2x pro Jahr', 'April, Oktober',   'DIN Lang','Immer nach Postkarte', false, false),
  ('a1000000-0000-0000-0000-000000000001', 'Tuuci (Südlich)',  'Outdoor',      'Annika/Merlin','1x pro Jahr', 'März',             'A5',     'Immer nach Postkarte', false, false);

-- ============================================================
-- Manufacturers — EMQuadrat (a2)
-- ============================================================
INSERT INTO manufacturers (agency_id, name, category, contact_person, postcard_frequency, postcard_months, postcard_format, newsletter_frequency, own_creatives, own_texts) VALUES
  ('a2000000-0000-0000-0000-000000000002', 'ADL',              'Licht',        'Annika/Merlin','2x pro Jahr', 'Januar, Juli',     'A5',     'Immer nach Postkarte', false, false),
  ('a2000000-0000-0000-0000-000000000002', 'Terzani',          'Licht',        'Annika/Merlin','2x pro Jahr', 'Februar, August',  'DIN Lang','Immer nach Postkarte', false, false),
  ('a2000000-0000-0000-0000-000000000002', 'DePadova',         'Möbel',        'Karo',         '2x pro Jahr', 'März, September',  'A5',     'Immer nach Postkarte', false, false);

-- ============================================================
-- Manufacturers — Exclusive Collection (a3)
-- ============================================================
INSERT INTO manufacturers (agency_id, name, category, contact_person, postcard_frequency, postcard_months, postcard_format, newsletter_frequency, own_creatives, own_texts) VALUES
  ('a3000000-0000-0000-0000-000000000003', 'Arclinea',         'Küche',        'Karo',         '2x pro Jahr', 'Februar, August',  'A5',     'Immer nach Postkarte', false, false),
  ('a3000000-0000-0000-0000-000000000003', 'Marset',           'Licht',        'Annika/Merlin','2x pro Jahr', 'März, September',  'DIN Lang','Immer nach Postkarte', false, false),
  ('a3000000-0000-0000-0000-000000000003', 'Maxalto',          'Möbel',        'Karo',         '2x pro Jahr', 'April, Oktober',   'A5',     'Immer nach Postkarte', false, false),
  ('a3000000-0000-0000-0000-000000000003', 'B&B Outdoor',      'Outdoor',      'Annika/Merlin','1x pro Jahr', 'März',             'A5',     'Immer nach Postkarte', false, false),
  ('a3000000-0000-0000-0000-000000000003', 'Tuuci (Norden)',   'Outdoor',      'Annika/Merlin','1x pro Jahr', 'März',             'A5',     'Immer nach Postkarte', false, false),
  ('a3000000-0000-0000-0000-000000000003', 'B&B',              'Möbel',        'Karo',         '3x pro Jahr', 'Februar, Juni, Oktober','DIN Lang','Immer nach Postkarte', false, false);

-- ============================================================
-- Manufacturers — Design Collection (a4)
-- ============================================================
INSERT INTO manufacturers (agency_id, name, category, contact_person, postcard_frequency, postcard_months, postcard_format, newsletter_frequency, own_creatives, own_texts) VALUES
  ('a4000000-0000-0000-0000-000000000004', 'Lodes Hamburg/Ost','Licht',        'Annika/Merlin','2x pro Jahr', 'Januar, Juli',     'A5',     'Immer nach Postkarte', false, false),
  ('a4000000-0000-0000-0000-000000000004', 'Magis Nord/Mitte', 'Möbel',        'Karo',         '2x pro Jahr', 'März, September',  'A5',     'Immer nach Postkarte', false, false);

-- ============================================================
-- Manufacturers — vondomani (a5)
-- ============================================================
INSERT INTO manufacturers (agency_id, name, category, contact_person, postcard_frequency, postcard_months, postcard_format, newsletter_frequency, own_creatives, own_texts) VALUES
  ('a5000000-0000-0000-0000-000000000005', 'Arflex',           'Möbel',        'Karo',         '2x pro Jahr', 'Februar, August',  'DIN Lang','Immer nach Postkarte', false, false),
  ('a5000000-0000-0000-0000-000000000005', 'Baxter',           'Möbel',        'Karo',         '2x pro Jahr', 'März, Oktober',    'A5',     'Immer nach Postkarte', false, false);
