
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://meskxoyxhbvnataavkkh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lc2t4b3l4aGJ2bmF0YWF2a2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyNDc4NTMsImV4cCI6MjA1MjgyMzg1M30.rIe7Jj-P1hZ2aP6_jO7y3eO4-Rk2n8_U1t9_w9_X2Z8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('--- CHECKING TOTAL MOVEMENTS ---');

    // Count movements for Warehouse 6 (Nos)
    const { count, error } = await supabase
        .from('movements')
        .select('*', { count: 'exact', head: true })
        .eq('warehouse_id', 6);

    if (error) console.error(error);
    else console.log(`Total Movements in Warehouse 6: ${count}`);
}

run();

