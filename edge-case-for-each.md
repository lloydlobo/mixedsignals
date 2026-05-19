# edge case

## summary

This benchmark is worth unpacking because it exposes a distinction people often blur together:

```txt
array forEach callback    31.7 ms
for...of                   3.5 ms
classic                    2.4 ms
```

That result is not saying:

> "`forEach` is always 13× slower"

It is saying:

> "when the body does almost no work, callback machinery becomes the work."

That is a very different statement.

Let's decompose what the engine is actually doing.

Your benchmark:

```js
nums.forEach(
    n => void (n + 1)
);
```

looks tiny.

But conceptually it behaves more like:

```js
const fn = n => {
    n + 1;
    return undefined;
};

for (let i = 0; i < nums.length; i++) {
    fn(nums[i], i, nums);
}
```

For every element:

1. fetch callback
2. invoke callback
3. establish function execution context
4. bind arguments
5. manage scope
6. return
7. continue loop

Even if V8 inlines some of this, there is machinery.

Meanwhile:

```js
for(const n of nums)
    n + 1;
```

is conceptually:

```js
const iterator=nums[Symbol.iterator]();

while(true){

    const x=iterator.next();

    if(x.done)
        break;

    const n=x.value;

    n+1;
}
```

And classic:

```js
for(let i=0;i<nums.length;i++)
    nums[i]+1;
```

is roughly:

```js
i=0
jump
read index
increment
jump
```

Minimal abstraction.

---

The key is this line:

```js
n+1
```

It does essentially nothing.

So imagine fake costs:

```txt
work body            = 1 unit
callback overhead    = 10 units
loop overhead        = 1 unit
```

Then:

### classic

```txt
1 + 1 = 2
```

### for...of

```txt
1 + 2 = 3
```

### forEach

```txt
1 + 10 = 11
```

The overhead dominates because the body is trivial.

---

Now imagine real work:

```js
nums.forEach(n => {

    heavyPhysics();

    updateParticles();

    pathFind();

});
```

Now fake costs become:

```txt
actual work          = 500
callback overhead    = 10
```

Result:

```txt
510 vs 500
```

~2%

Now callback cost disappears.

That is why benchmark C looked flat:

```txt
removeAttribute
≈5100
≈5090
≈5140
```

because:

```js
n.removeAttribute()
```

already enters browser DOM internals.

Your loop machinery becomes tiny relative to DOM work.

---

Another subtle point:

People often hear:

> "callbacks allocate"

That statement is incomplete.

This:

```js
nums.forEach(
   n=>void(n+1)
)
```

creates one callback:

```js
n=>void(n+1)
```

not ten thousand callbacks.

The callback object itself is not repeatedly allocated.

The expensive part is repeatedly *calling* it.

Function invocation is not free.

---

Another interesting thing:

Your benchmark was:

```js
const nums =
    new Array(10000)
        .fill(0);
```

V8 heavily optimizes numeric arrays.

So:

```js
for(let i=0;i<nums.length;i++)
```

can become very close to machine-level array walking.

The engine can predict:

* packed array
* integers
* stable shape
* contiguous memory

It can aggressively optimize.

`forEach()` is harder because arbitrary callbacks can do arbitrary things:

```js
nums.forEach(n=>{

    globalThing++;

    mutateArray();

    throwIfNeeded();

});
```

The optimizer must preserve semantics.

---

The interesting takeaway is not:

```txt
never use forEach
```

The useful takeaway is:

```txt
small work + huge iteration count
        ↓
callback overhead visible
```

Examples:

```js
particle updates
audio sample processing
collision checks
pixel work
pathfinding grids
per-frame hot loops
```

That is game-engine territory.

Versus:

```js
buttons.forEach(...)
cards.forEach(...)
querySelectorAll(...).forEach(...)
```

Those usually involve DOM work already expensive enough to bury callback cost.

Your benchmark accidentally isolated a real engine characteristic:

```txt
pure CPU iteration:
classic wins

DOM mutation:
nearly tied
```

That distinction matters more than any blanket "forEach bad" rule.
