import { useState } from "react";

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

const initialItems: CartItem[] = [
  { id: "gpu", name: "RTX 5090 Founders Edition", price: 1999, quantity: 1 },
  { id: "cpu", name: "Ryzen 9 9950X3D", price: 699, quantity: 1 },
];

export default function CartDrawer() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialItems);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/10"
      >
        Cart
        <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 font-mono text-[10px] text-cyan-200">
          {count}
        </span>
      </button>

      {open ? (
        <aside className="absolute right-0 z-20 mt-3 w-80 rounded-xl border border-white/10 bg-[#15151b] p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wider text-zinc-200 uppercase">
              Your build
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] text-zinc-500 hover:text-zinc-200"
            >
              Close
            </button>
          </div>
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-zinc-200">{item.name}</p>
                  <p className="font-mono text-[10px] text-zinc-500">${item.price}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setItems((current) => current.filter((entry) => entry.id !== item.id))
                  }
                  className="text-[10px] text-rose-300/80 hover:text-rose-200"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
            <span className="text-[10px] tracking-wider text-zinc-500 uppercase">Total</span>
            <span className="font-mono text-sm text-cyan-300">${total.toLocaleString()}</span>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
