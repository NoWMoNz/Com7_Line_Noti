-- ล็อก search_path ของ trigger function (Supabase security advisor: function_search_path_mutable)
-- now() อยู่ใน pg_catalog ซึ่งถูกค้นหาเสมอ จึงตั้งเป็นค่าว่างได้
alter function public.set_updated_at() set search_path = '';
