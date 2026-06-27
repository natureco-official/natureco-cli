// Fibonacci Hesaplayıcı
// usage: node fibonacci.js [n]

const n = parseInt(process.argv[2]) || 10;

// ⚠️ Büyük sayılar için limit
if (n > 50) {
  console.log('⚠️ Güvenlik: n değeri 50\'den büyük olmamalı (performans için)');
  process.exit(1);
}

// Method 1: Iterative (En verimli)
function fibonacciIterative(num) {
  if (num <= 1) return num;
  
  let prev = 0, curr = 1;
  
  for (let i = 2; i <= num; i++) {
    [prev, curr] = [curr, prev + curr];
  }
  return curr;
}

// Method 2: Recursive (Basit ama yavaş)
function fibonacciRecursive(num) {
  if (num <= 1) return num;
  return fibonacciRecursive(num - 1) + fibonacciRecursive(num - 2);
}

// Method 3: Memoization (Hızlı recursive)
function fibonacciMemo(num, memo = {}) {
  if (num <= 1) return num;
  if (memo[num]) return memo[num];
  memo[num] = fibonacciMemo(num - 1, memo) + fibonacciMemo(num - 2, memo);
  return memo[num];
}

// Test
console.log(`\n🧡 Fibonacci Serisi (${n} eleman):\n`);

const series = [];
for (let i = 0; i < n; i++) {
  series.push(fibonacciIterative(i));
}

console.log(series.join(', '));
console.log(`\n📊 fibonacci(${n}) = ${fibonacciIterative(n)}`);
console.log(`📊 fibonacci(${n}) [recursive] = ${fibonacciRecursive(n)}`);
console.log(`📊 fibonacci(${n}) [memo] = ${fibonacciMemo(n)}`);
console.log('');
