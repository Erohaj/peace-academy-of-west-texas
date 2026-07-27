-- PAWTX seed data — the former contents of src/data/mockData.ts.
--
-- Run automatically by `supabase db reset` locally. NOT run by `db push`, so
-- production is seeded once, deliberately, with `supabase db reset --linked`
-- or by pasting this into the SQL editor.
--
-- IDs are fixed rather than generated so reseeding is idempotent and so the
-- same rows can be referenced from shifts below.
--
-- `image_key` values index the IMAGES registry in src/data/mockData.ts, which
-- maps them to content-hashed bundled WebP files. Admin-uploaded photos will
-- instead populate `image_url`. See the header of the init migration.
--
-- Times are wall-clock Central (America/Chicago) — the timezone PAWTX
-- operates in — converted to timestamptz on insert.

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

insert into public.events (
  id, title, title_es, description, description_es,
  starts_at, ends_at, location, category,
  total_spots, reserved_spots, image_key, status, featured
) values
(
  '11111111-0000-4000-8000-000000000001',
  'International Cooking Class: Authentic Rendang & Asian Flavors',
  'Clase Internacional de Cocina: Rendang Auténtico y Sabores Asiáticos',
  'Hands-on culinary workshop guided by local community chefs. Learn spice blending, authentic cooking techniques, and share a communal dinner.',
  'Taller culinario práctico guiado por chefs locales. Aprende combinación de especias, técnicas auténticas y comparte una cena comunitaria.',
  timestamp '2026-08-15 17:30' at time zone 'America/Chicago',
  timestamp '2026-08-15 20:30' at time zone 'America/Chicago',
  'Odessa Community Kitchen, 1200 N Texas Ave, Odessa, TX',
  'cooking', 20, 8, 'cookingClass', 'upcoming', true
),
(
  '11111111-0000-4000-8000-000000000002',
  'Ladies Coffee & Cultural Exchange Night',
  'Noche de Café y Intercambio Cultural para Mujeres',
  'A cozy evening for women of all backgrounds to meet, enjoy coffee & traditional pastries, and build lasting friendships in West Texas.',
  'Una acogedora velada para que mujeres de todos los orígenes se conozcan, disfruten de café y repostería tradicional, y creen amistades duraderas.',
  timestamp '2026-08-20 18:30' at time zone 'America/Chicago',
  timestamp '2026-08-20 20:30' at time zone 'America/Chicago',
  'Midland Community Center, 2000 W Wadley Ave, Midland, TX',
  'cultural', 25, 17, 'coffeeNight', 'upcoming', true
),
(
  -- Deliberately at capacity (150/150) so the "event full" path stays testable.
  '11111111-0000-4000-8000-000000000003',
  'West Texas International Heritage Parade & Festival',
  'Desfile y Festival Internacional de la Herencia del Oeste de Tejas',
  'Annual flagship celebration featuring cultural booths (Tajikistan, Kenya, Mexico, USA), traditional dance performances, parade, and global cuisine.',
  'Celebración anual principal con stands culturales (Tayikistán, Kenia, México, EE. UU.), bailes tradicionales, desfile y gastronomía global.',
  timestamp '2026-09-12 10:00' at time zone 'America/Chicago',
  timestamp '2026-09-12 16:00' at time zone 'America/Chicago',
  'Noel Heritage Plaza, Downtown Odessa, TX',
  'cultural', 150, 150, 'parade', 'upcoming', true
),
(
  '11111111-0000-4000-8000-000000000004',
  'Peace & Diversity Seminar: Building Bridges in West Texas',
  'Seminario de Paz y Diversidad: Construyendo Puentes en el Oeste de Tejas',
  'An interactive discussion on community integration, interfaith dialogue, and civil engagement hosted by West Texas educators and leaders.',
  'Una discusión interactiva sobre integración comunitaria, diálogo interfe y participación civil con educadores y líderes de Tejas.',
  timestamp '2026-09-22 18:00' at time zone 'America/Chicago',
  timestamp '2026-09-22 20:00' at time zone 'America/Chicago',
  'UT Permian Basin Lecture Hall, Odessa, TX',
  'seminars', 60, 35, 'seminar', 'upcoming', false
),
(
  '11111111-0000-4000-8000-000000000005',
  'Fall Family Food & Warm Clothing Emergency Relief Drive',
  'Campaña de Ayuda de Alimentos y Ropa de Invierno para Familias',
  'Community outreach drive collecting non-perishable goods, jackets, and emergency support boxes for West Texas families in need.',
  'Campaña de apoyo comunitario recolectando alimentos no perecederos, abrigos y cajas de ayuda para familias necesitadas.',
  timestamp '2026-10-03 09:00' at time zone 'America/Chicago',
  timestamp '2026-10-03 14:00' at time zone 'America/Chicago',
  'Peace Academy Volunteer Center, Midland, TX',
  'relief', 40, 12, 'reliefDrive', 'upcoming', false
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- gallery_items
-- ---------------------------------------------------------------------------

insert into public.gallery_items (
  id, title, title_es, caption, caption_es, category, image_key, taken_on, location, sort_order
) values
(
  '22222222-0000-4000-8000-000000000001',
  'Heritage Parade on the Green', 'Desfile de la Herencia en la Plaza',
  'Children and volunteers leading the West Texas International Heritage Parade with American and Texas state flags.',
  'Niños y voluntarios liderando el Desfile Internacional de la Herencia con banderas de EE. UU. y Tejas.',
  'cultural', 'parade', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 1
),
(
  '22222222-0000-4000-8000-000000000002',
  'Different Cultures, One Community', 'Diferentes Culturas, Una Sola Comunidad',
  'Diverse community volunteers coming together with handmade signs celebrating unity in diversity across Midland & Odessa.',
  'Voluntarios comunitarios reunidos con carteles hechos a mano celebrando la unidad en la diversidad.',
  'cultural', 'communitySign', date '2025-09-01', 'Midland Community Park, TX', 2
),
(
  '22222222-0000-4000-8000-000000000003',
  'Tajikistan Cultural Pavilion & Hospitality', 'Pabellón Cultural de Tayikistán y Hospitalidad',
  'Local Tajik-American family showcasing traditional embroidered tapestries, fresh tea, non-bread, and cultural heritage.',
  'Familia tayiko-americana exhibiendo bordados tradicionales, té fresco, pan artesanal y herencia cultural.',
  'cultural', 'tajikistanBooth', date '2025-10-01', 'Odessa Heritage Grounds, TX', 3
),
(
  '22222222-0000-4000-8000-000000000004',
  'Traditional Folk Costume Celebration', 'Celebración de Trajes Folclóricos Tradicionales',
  'Young participant wearing hand-embroidered Mexican folk dress and floral straw hat during the cultural dance showcase.',
  'Joven participante vistiendo un traje folclórico mexicano bordado a mano y sombrero de paja con flores.',
  'cultural', 'mexicanCostume', date '2025-10-01', 'Odessa, TX', 4
),
(
  '22222222-0000-4000-8000-000000000005',
  'India Cultural Pavilion', 'Pabellón Cultural de India',
  'Volunteers at the India booth share crafts and hospitality with festival visitors beneath a Taj Mahal backdrop.',
  'Voluntarios en el stand de India comparten artesanías y hospitalidad con los visitantes bajo un fondo del Taj Mahal.',
  'cultural', 'indiaBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 5
),
(
  '22222222-0000-4000-8000-000000000006',
  'International Dumpling & Cooking Workshop', 'Taller de Cocina y Empanadas Internacionales',
  'Community members learning spice techniques and rolling dough in our monthly cooking workshop.',
  'Miembros comunitarios aprendiendo técnicas de especias y amasado en nuestro taller de cocina mensual.',
  'cooking', 'cookingClass', date '2025-11-01', 'Odessa Community Kitchen, TX', 6
),
(
  '22222222-0000-4000-8000-000000000007',
  'Nigeria Cultural Pavilion', 'Pabellón Cultural de Nigeria',
  'A Nigerian-American family shares traditional dress and heritage with festival visitors at the International Cultural Festival.',
  'Una familia nigeriano-americana comparte vestimenta tradicional y herencia cultural con los visitantes del Festival Cultural Internacional.',
  'cultural', 'nigeriaBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 7
),
(
  '22222222-0000-4000-8000-000000000008',
  'Turkish Cultural Pavilion', 'Pabellón Cultural de Turquía',
  'Volunteers welcome guests to the Turkey booth, sharing flags, crafts, and traditions with the West Texas community.',
  'Voluntarios reciben a los visitantes en el stand de Turquía, compartiendo banderas, artesanías y tradiciones con la comunidad.',
  'cultural', 'turkeyBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 8
),
(
  '22222222-0000-4000-8000-000000000009',
  'Jordan Cultural Pavilion', 'Pabellón Cultural de Jordania',
  'Guests sample traditional treats and tea at the Jordan booth during the International Cultural Festival.',
  'Los invitados prueban dulces y té tradicionales en el stand de Jordania durante el Festival Cultural Internacional.',
  'cultural', 'jordanBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 9
),
(
  '22222222-0000-4000-8000-000000000010',
  'Germany Cultural Pavilion', 'Pabellón Cultural de Alemania',
  'Volunteers representing Germany welcome festival-goers beneath a Brandenburg Gate backdrop.',
  'Voluntarios representando a Alemania reciben a los asistentes del festival bajo un fondo de la Puerta de Brandeburgo.',
  'cultural', 'germanyBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 10
),
(
  '22222222-0000-4000-8000-000000000011',
  'Cameroon & Peru Cultural Booths', 'Stands Culturales de Camerún y Perú',
  'A volunteer in traditional Cameroonian dress welcomes visitors alongside the neighboring Peru pavilion.',
  'Una voluntaria con vestimenta tradicional camerunesa recibe a los visitantes junto al pabellón vecino de Perú.',
  'cultural', 'cameroonPeruBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 11
),
(
  '22222222-0000-4000-8000-000000000012',
  'Vietnam Food Pavilion', 'Pabellón Gastronómico de Vietnam',
  'Volunteers serve traditional dishes at the Vietnam booth, part of the festival''s global food showcase.',
  'Voluntarios sirven platillos tradicionales en el stand de Vietnam, parte de la muestra gastronómica global del festival.',
  'cooking', 'vietnamBooth', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 12
),
(
  '22222222-0000-4000-8000-000000000013',
  'Community Fire & Rescue Partnership', 'Asociación Comunitaria con Bomberos y Rescate',
  'Local firefighters join the festival grounds, strengthening ties between first responders and the community they serve.',
  'Bomberos locales se unen al festival, fortaleciendo los lazos entre los primeros respondientes y la comunidad a la que sirven.',
  'relief', 'firefightersGroup', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 13
),
(
  '22222222-0000-4000-8000-000000000014',
  'Native Heritage Dance Performance', 'Presentación de Danza de Herencia Nativa',
  'A dancer in traditional regalia performs for festival guests, honoring Native heritage as part of the cultural showcase.',
  'Un bailarín con atuendo tradicional se presenta ante los invitados del festival, honrando la herencia nativa como parte de la muestra cultural.',
  'cultural', 'nativeHeritageDance', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 14
),
(
  '22222222-0000-4000-8000-000000000015',
  'Different Cultures, One Community (Encore)', 'Diferentes Culturas, Una Sola Comunidad (Bis)',
  'Another group of volunteers and neighbors rally behind the festival''s signature message of unity in diversity.',
  'Otro grupo de voluntarios y vecinos se une en torno al mensaje distintivo del festival: la unidad en la diversidad.',
  'cultural', 'oneCommunityEncore', date '2025-10-01', 'Noel Heritage Plaza, Odessa, TX', 15
),
(
  '22222222-0000-4000-8000-000000000016',
  'Trying On Traditions Together', 'Probando Tradiciones Juntas',
  'Women from different backgrounds share and try on each other''s traditional dress during a community cultural exchange evening.',
  'Mujeres de diferentes orígenes comparten y se prueban trajes tradicionales entre sí durante una velada comunitaria de intercambio cultural.',
  'cultural', 'culturalCostumeExchange', date '2023-11-01', 'Odessa, TX', 16
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- shifts
--
-- duration_hours is a generated column derived from starts_at/ends_at, so it
-- is intentionally absent from this insert.
-- ---------------------------------------------------------------------------

insert into public.shifts (
  id, event_id, title, title_es, description, description_es,
  role, role_es, starts_at, ends_at, spots_total, spots_filled
) values
(
  '33333333-0000-4000-8000-000000000001',
  '11111111-0000-4000-8000-000000000001',
  'Kitchen Assistant & Food Prep', 'Asistente de Cocina y Preparación de Alimentos',
  'Help chop vegetables, prep cooking stations, and assist chefs during the International Cooking Class.',
  'Ayuda a picar verduras, preparar estaciones de cocina y asistir a los chefs durante la Clase Internacional de Cocina.',
  'Food Prep', 'Preparación de Alimentos',
  timestamp '2026-08-15 16:00' at time zone 'America/Chicago',
  timestamp '2026-08-15 19:00' at time zone 'America/Chicago',
  5, 2
),
(
  '33333333-0000-4000-8000-000000000002',
  '11111111-0000-4000-8000-000000000002',
  'Welcome Desk & Greeter', 'Mesa de Bienvenida y Recepción',
  'Greet guests, manage check-in lists, and distribute event materials for Ladies Coffee Night.',
  'Saluda a las invitadas, gestiona las listas de registro y distribuye materiales en la Noche de Café.',
  'Greeter', 'Recepción',
  timestamp '2026-08-20 18:00' at time zone 'America/Chicago',
  timestamp '2026-08-20 20:30' at time zone 'America/Chicago',
  3, 1
),
(
  '33333333-0000-4000-8000-000000000003',
  '11111111-0000-4000-8000-000000000003',
  'Festival Pavilion Setup & Logistics', 'Montaje de Pabellones y Logística del Festival',
  'Help set up tents, tables, signage, and sound equipment for the Heritage Parade & Festival.',
  'Ayuda a montar carpas, mesas, señalización y equipo de sonido para el Desfile y Festival.',
  'Event Setup', 'Montaje de Evento',
  timestamp '2026-09-12 07:30' at time zone 'America/Chicago',
  timestamp '2026-09-12 11:00' at time zone 'America/Chicago',
  10, 6
),
(
  '33333333-0000-4000-8000-000000000004',
  '11111111-0000-4000-8000-000000000004',
  'Spanish-English Bilingual Translator', 'Traductor Bilingüe Español-Inglés',
  'Provide real-time translation assistance and facilitate small group conversations during the Diversity Seminar.',
  'Brinda asistencia de traducción en tiempo real y facilita conversaciones en grupos durante el Seminario de Diversidad.',
  'Translator', 'Traductor',
  timestamp '2026-09-22 17:30' at time zone 'America/Chicago',
  timestamp '2026-09-22 20:30' at time zone 'America/Chicago',
  4, 2
),
(
  '33333333-0000-4000-8000-000000000005',
  '11111111-0000-4000-8000-000000000005',
  'Relief Box Assembly & Distribution', 'Ensamblaje y Distribución de Cajas de Ayuda',
  'Pack non-perishable food boxes, sort donated winter coats, and assist families loading supplies.',
  'Empaca cajas de alimentos no perecederos, clasifica abrigos e incentiva la carga de suministros a las familias.',
  'Distribution', 'Distribución',
  timestamp '2026-10-03 08:30' at time zone 'America/Chicago',
  timestamp '2026-10-03 13:00' at time zone 'America/Chicago',
  8, 3
)
on conflict (id) do nothing;
