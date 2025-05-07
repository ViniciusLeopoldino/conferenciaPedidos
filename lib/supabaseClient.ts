import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tulmywnwvbzrxpdkymwi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1bG15d253dmJ6cnhwZGt5bXdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjU1NDA4MywiZXhwIjoyMDYyMTMwMDgzfQ.FcOT9UG9B87tyLKQFfsdpGuuOdNNIvmaQtoVBNc8ccg'!;
export const supabase = createClient(supabaseUrl, supabaseKey);