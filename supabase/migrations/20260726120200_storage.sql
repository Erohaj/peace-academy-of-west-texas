-- Storage bucket for admin-uploaded event and gallery photos.
--
-- Photos that ship with the app stay in src/assets and are referenced by
-- `image_key`; anything an admin uploads through the panel lands here and is
-- referenced by an absolute `image_url`. See resolveImage() in
-- src/lib/api/images.ts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  -- Public read: these are photos on a public marketing site, and signed URLs
  -- would expire in the middle of a visitor's session for no benefit.
  true,
  5242880, -- 5 MB; the panel resizes in-browser before upload
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy "media: public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'media');

create policy "media: admins upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'media' and public.is_admin());

create policy "media: admins update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

create policy "media: admins delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'media' and public.is_admin());
