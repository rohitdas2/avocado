export function normalizeFood(food) {
  const nutrient = (...ids) => {
    for (const id of ids) {
      const n = food.foodNutrients?.find(n => n.nutrientId === id);
      if (Number.isFinite(n?.value) && n.value >= 0) return n.value;
    }
    return null;
  };
  return { id: food.fdcId, name: food.description, calories: nutrient(1008, 2048, 2047), protein: nutrient(1003), carbs: nutrient(1005), fat: nutrient(1004) };
}
export async function searchFoods(query, fetcher = fetch) {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.search = new URLSearchParams({api_key: process.env.USDA_API_KEY || 'DEMO_KEY', query, dataType: 'SR Legacy', pageSize: '12'}).toString();
  const response = await fetcher(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(response.status === 429 ? 'Nutrition search limit reached. Try later or configure a USDA API key.' : 'Nutrition search is unavailable. You can still add food manually.');
  const body = await response.json();
  return (body.foods || []).map(normalizeFood);
}
