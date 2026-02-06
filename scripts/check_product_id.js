import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://meskxoyxhbvnataavkkh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lc2t4b3l4aGJ2bmF0YWF2a2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcyNDc4NTMsImV4cCI6MjA1MjgyMzg1M30.rIe7Jj-P1hZ2aP6_jO7y3eO4-Rk2n8_U1t9_w9_X2Z8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('--- CHECKING PRODUCT_ID FORMAT ---');

    // Get a sample movement
    const { data: moveSample } = await supabase
        .from('movements')
        .select('id, product_id, type, quantity')
        .limit(3);
    console.log('Sample Movements:');
    console.log(JSON.stringify(moveSample, null, 2));
    console.log('product_id type:', typeof moveSample?.[0]?.product_id);

    // Get a sample product
    const { data: prodSample } = await supabase
        .from('products')
        .select('id, code, name')
        .limit(3);
    console.log('\nSample Products:');
    console.log(JSON.stringify(prodSample, null, 2));
    console.log('id type:', typeof prodSample?.[0]?.id);

    // Try to find Cable ADSS
    const { data: cable } = await supabase
        .from('products')
        .select('*')
        .ilike('name', '%CABLE ADSS%')
        .limit(1)
        .single();
    console.log('\nCable ADSS Product:');
    console.log(JSON.stringify(cable, null, 2));

    // Find movements for this product
    if (cable) {
        const { data: cableMoves, count } = await supabase
            .from('movements')
            .select('*', { count: 'exact' })
            .eq('product_id', cable.id)
            .limit(3);
        console.log(`\nMovements for Cable ADSS (id=${cable.id}):`, count);
        console.log(JSON.stringify(cableMoves, null, 2));
    }
}

run();
