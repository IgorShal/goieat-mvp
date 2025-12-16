import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import { QRCodeCanvas } from 'qrcode.react'
import { useLocation, useNavigate } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import './App.css'

type Venue = {
  id: number
  name: string
  city: string
  description: string
  lat: number
  lng: number
  deal: string
}

type Product = {
  id: number
  venue_id: number
  name: string
  price: number
  description: string
  image: string
}

type CartItem = { product: Product; qty: number }

type Order = {
  id: number
  status: string
  total: number
  qr_code: string
  items: { product_id: number; qty: number }[]
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

// Fix Leaflet icons for Vite
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'customer' | 'partner'>('customer')
  const [role, setRole] = useState<'customer' | 'partner' | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [isPlacing, setIsPlacing] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [partnerProducts, setPartnerProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showVenueModal, setShowVenueModal] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [newVenue, setNewVenue] = useState({
    name: '',
    city: 'Новосибирск',
    description: '',
    lat: 55.0302,
    lng: 82.9204,
    deal: '',
  })
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: 0,
    description: '',
    image:
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=60',
    venue_id: 0,
  })
  const [recentlyAddedProductId, setRecentlyAddedProductId] = useState<number | null>(
    null,
  )

  useEffect(() => {
    if (location.pathname === '/customer') {
      setRole('customer')
      setMode('customer')
    } else if (location.pathname === '/partner') {
      setRole('partner')
      setMode('partner')
    } else {
      setRole(null)
    }
  }, [location.pathname])

  useEffect(() => {
    fetch(`${API_URL}/venues`)
      .then((r) => r.json())
      .then((data) => {
        setVenues(data)
        if (data?.length) {
          setSelectedVenue(data[0])
        }
      })
      .catch(() => setError('Не удалось загрузить заведения'))
  }, [])

  useEffect(() => {
    if (!selectedVenue) return
    fetch(`${API_URL}/venues/${selectedVenue.id}/products`)
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => setError('Не удалось загрузить меню'))
  }, [selectedVenue])

  useEffect(() => {
    if (mode !== 'partner') return
    Promise.all([
      fetch(`${API_URL}/partner/orders`).then((r) => r.json()),
      fetch(`${API_URL}/partner/products`).then((r) => r.json()),
    ])
      .then(([ordersData, productsData]) => {
        setOrders(ordersData)
        setPartnerProducts(productsData)
      })
      .catch(() => setError('Не удалось загрузить кабинет партнёра'))
  }, [mode])

  const cartTotal = useMemo(
    () =>
      cart.reduce((sum, item) => sum + item.product.price * item.qty, 0).toFixed(0),
    [cart],
  )

  const handleAddToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id)
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c,
        )
      }
      return [...prev, { product, qty: 1 }]
    })
    setRecentlyAddedProductId(product.id)
    setTimeout(() => setRecentlyAddedProductId(null), 350)
  }

  const updateQty = (id: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.product.id === id ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0),
    )
  }

  const placeOrder = async () => {
    if (!selectedVenue || !cart.length) return
    setIsPlacing(true)
    setError(null)
    try {
      const payload = {
        venue_id: selectedVenue.id,
        items: cart.map((c) => ({ product_id: c.product.id, qty: c.qty })),
      }
      const res = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('order failed')
      const data = await res.json()
      setActiveOrder(data)
      setCart([])
    } catch (e) {
      setError('Не удалось создать заказ')
    } finally {
      setIsPlacing(false)
    }
  }

  const markReady = async (orderId: number) => {
    await fetch(`${API_URL}/orders/${orderId}/status?status=ready`, {
      method: 'PATCH',
    })
    const updated = await fetch(`${API_URL}/partner/orders`).then((r) => r.json())
    setOrders(updated)
  }

  const createProduct = async () => {
    if (!newProduct.name || !newProduct.price || !newProduct.venue_id) return
    const body = newProduct
    const res = await fetch(`${API_URL}/partner/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const product = await res.json()
    setPartnerProducts((p) => [product, ...p])
    setShowProductModal(false)
    setNewProduct({
      name: '',
      price: 0,
      description: '',
      image:
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=60',
      venue_id: 0,
    })
  }

  const addVenue = async () => {
    if (!newVenue.name || !newVenue.deal) return
    const res = await fetch(`${API_URL}/partner/venues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newVenue),
    })
    if (!res.ok) {
      setError('Не удалось создать заведение')
      return
    }
    const venue = await res.json()
    setVenues((prev) => [...prev, venue])
    setSelectedVenue(venue)
    setShowVenueModal(false)
    setNewVenue({
      name: '',
      city: 'Новосибирск',
      description: '',
      lat: 55.0302,
      lng: 82.9204,
      deal: '',
    })
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <div>
            <p className="eyebrow">MVP FOODPASS</p>
            <h1>Скидки и предзаказ рядом</h1>
          </div>
        </div>
        {role && (
          <div className="modes">
            <button
              className={mode === 'customer' ? 'pill active' : 'pill'}
              onClick={() => navigate('/customer')}
            >
              Покупатель
            </button>
            <button
              className={mode === 'partner' ? 'pill active' : 'pill'}
              onClick={() => navigate('/partner')}
            >
              Партнёр
            </button>
          </div>
        )}
      </header>

      {error && <div className="toast">{error}</div>}

      {!role && (
        <div className="entry">
          <div className="panel entry-card">
            <p className="eyebrow">Выберите роль</p>
            <h2>Кто вы?</h2>
            <div className="entry-actions">
              <button
                className="cta full"
                onClick={() => {
                  navigate('/customer')
                }}
              >
                Я покупатель
              </button>
              <button
                className="ghost full"
                onClick={() => {
                  navigate('/partner')
                }}
              >
                Я партнёр
              </button>
            </div>
          </div>
        </div>
      )}

      {role === 'customer' && mode === 'customer' && (
        <>
          <section className="hero">
            <div>
              <p className="badge">Только проверенные акции</p>
              <h2>Выбирай на карте, бронируй и оплачивай онлайн</h2>
              <p className="muted">
                Подборка заведений с лучшими предложениями. Оплатите сейчас, заберите без очереди —
                покажите QR в заведении.
              </p>
              <div className="hero-cta">
                <button className="cta">Смотреть акции</button>
                <button className="ghost" onClick={() => setShowHowItWorks(true)}>
                  Как это работает
                </button>
              </div>
            </div>
            <div className="hero-card">
              <div className="mini-map">
                {selectedVenue && (
                  <MapContainer
                    center={[selectedVenue.lat, selectedVenue.lng]}
                    zoom={13}
                    scrollWheelZoom={false}
                  >
                    <TileLayer
                      attribution="&copy; OpenStreetMap"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {venues.map((v) => (
                      <Marker key={v.id} position={[v.lat, v.lng]}>
                        <Popup>
                          <strong>{v.name}</strong>
                          <br />
                          {v.deal}
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                )}
              </div>
              <div className="hero-info">
                <p className="muted">В радиусе 2 км</p>
                {venues.slice(0, 3).map((v) => (
                  <div key={v.id} className="hero-venue">
                    <div>
                      <strong>{v.name}</strong>
                      <p className="muted">{v.deal}</p>
                    </div>
                    <span className="pill light">{v.city}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="layout">
            <div className="left">
              <div className="panel">
                <div className="panel-head">
                  <h3>Заведения на карте</h3>
                  <span className="pill light">{venues.length} рядом</span>
                </div>
                <div className="map-wrap">
                  {selectedVenue && (
                    <MapContainer
                      center={[selectedVenue.lat, selectedVenue.lng]}
                      zoom={14}
                      scrollWheelZoom={true}
                    >
                      <TileLayer
                        attribution="&copy; OpenStreetMap"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {venues.map((v) => (
                        <Marker
                          key={v.id}
                          position={[v.lat, v.lng]}
                          eventHandlers={{ click: () => setSelectedVenue(v) }}
                        >
                          <Popup>
                            <strong>{v.name}</strong>
                            <br />
                            {v.deal}
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  )}
                </div>
                <div className="venue-list">
                  {venues.map((v) => (
                    <button
                      key={v.id}
                      className={
                        selectedVenue?.id === v.id ? 'venue-card active' : 'venue-card'
                      }
                      onClick={() => setSelectedVenue(v)}
                    >
                      <div>
                        <p className="eyebrow">{v.city}</p>
                        <h4>{v.name}</h4>
                        <p className="muted">{v.description}</p>
                      </div>
                      <span className="pill">{v.deal}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel">
                <div className="panel-head">
                  <h3>Каталог</h3>
                  {selectedVenue && <p className="muted">{selectedVenue.name}</p>}
                </div>
                <div className="grid">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      className={
                        recentlyAddedProductId === p.id ? 'product added' : 'product'
                      }
                    >
                      <div
                        className="product-img"
                        style={{ backgroundImage: `url(${p.image})` }}
                      />
                      <div className="product-info">
                        <div>
                          <h4>{p.name}</h4>
                          <p className="muted">{p.description}</p>
                        </div>
                        <div className="product-bottom">
                          <span className="price">{p.price} ₽</span>
                          <button onClick={() => handleAddToCart(p)}>В корзину</button>
                        </div>
                        {selectedVenue && (
                          <p className="muted small">Заведение: {selectedVenue.name}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="cart">
              <div className="panel sticky">
                <div className="panel-head">
                  <h3>Корзина</h3>
                  <span className="pill light">{cart.length} поз.</span>
                </div>
                {cart.length === 0 && <p className="muted">Добавьте блюда из каталога</p>}
                {cart.map((item) => (
                  <div key={item.product.id} className="cart-row">
      <div>
                      <strong>{item.product.name}</strong>
                      <p className="muted">{item.product.price} ₽</p>
                    </div>
                    <div className="qty">
                      <button onClick={() => updateQty(item.product.id, -1)}>-</button>
                      <span>{item.qty}</span>
                      <button onClick={() => updateQty(item.product.id, 1)}>+</button>
                    </div>
                  </div>
                ))}
                <div className="divider" />
                <div className="summary">
                  <span>Итого</span>
                  <strong>{cartTotal} ₽</strong>
                </div>
                <button
                  className="cta full"
                  onClick={placeOrder}
                  disabled={!cart.length || isPlacing}
                >
                  {isPlacing ? 'Оплата...' : 'Оплатить и получить QR'}
                </button>
                <p className="muted small">Оплата имитирована, получаем QR код</p>
      </div>
            </aside>
          </section>
        </>
      )}

      {mode === 'partner' && (
        <section className="partner">
          <div className="panel">
            <div className="panel-head">
              <h3>Новые заказы</h3>
            </div>
            <div className="table">
              <div className="table-head">
                <span>#</span>
                <span>Статус</span>
                <span>Сумма</span>
                <span>Действие</span>
              </div>
              {orders.length === 0 && <p className="muted">Пока пусто</p>}
              {orders.map((o) => (
                <div key={o.id} className="table-row">
                  <span>{o.id}</span>
                  <span className={o.status === 'ready' ? 'pill ready' : 'pill'}>
                    {o.status}
                  </span>
                  <span>{o.total} ₽</span>
                  <button onClick={() => markReady(o.id)}>Готово</button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Каталог партнёра</h3>
              <div className="modes">
                <button className="ghost" onClick={() => setShowVenueModal(true)}>
                  + Акция / Заведение
                </button>
                <button
                  onClick={() => {
                    setNewProduct((p) => ({
                      ...p,
                      venue_id: venues[0]?.id ?? 0,
                    }))
                    setShowProductModal(true)
                  }}
                  disabled={!venues.length}
                >
                  + Товар
                </button>
              </div>
            </div>
            <div className="grid">
              {partnerProducts.map((p) => (
                <div key={p.id} className="product compact">
                  <div
                    className="product-img"
                    style={{ backgroundImage: `url(${p.image})` }}
                  />
                  <div className="product-info">
                    <h4>{p.name}</h4>
                    <p className="muted">{p.price} ₽</p>
                    {venues.length > 0 && (
                      <p className="muted small">
                        {venues.find((v) => v.id === p.venue_id)?.name || 'Без заведения'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeOrder && (
        <div className="modal">
          <div className="modal-card">
            <p className="badge">Оплачено</p>
            <h3>Покажите QR в заведении</h3>
            <QRCodeCanvas value={activeOrder.qr_code} size={160} />
            <p className="muted">
              Заказ #{activeOrder.id}, статус: {activeOrder.status}
            </p>
            <button className="ghost" onClick={() => setActiveOrder(null)}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {showHowItWorks && (
        <div className="modal">
          <div className="modal-card">
            <h3>Как это работает</h3>
            <p className="muted">
              Мы не просто ищем еду, а находим выгоду. Обычный поиск еды: вы решаете поесть →
              смотрите меню по обычным ценам → платите полную стоимость.
            </p>
            <p className="muted">
              С нами рестораны в конце дня выставляют свежую, но нераспроданную еду
              (салаты, суши, горячее, выпечку) со скидкой до 70%.
            </p>
            <p className="muted">
              ✅ Вы: покупаете качественную еду из хороших мест за полцены.
              <br />
              ✅ Рестораны: продают то, что иначе выбросили бы, и находят новых клиентов.
            </p>
            <p className="muted">
              Вы не переплачиваете, они не теряют. Быстро, выгодно, без компромиссов в
              качестве.
            </p>
            <button className="ghost" onClick={() => setShowHowItWorks(false)}>
              Понятно
            </button>
          </div>
        </div>
      )}

      {showVenueModal && (
        <div className="modal">
          <div className="modal-card">
            <h3>Добавить акцию / заведение</h3>
            <div className="form-grid">
              <input
                placeholder="Название"
                value={newVenue.name}
                onChange={(e) => setNewVenue({ ...newVenue, name: e.target.value })}
              />
              <input
                placeholder="Город"
                value={newVenue.city}
                onChange={(e) => setNewVenue({ ...newVenue, city: e.target.value })}
              />
              <input
                placeholder="Описание"
                value={newVenue.description}
                onChange={(e) => setNewVenue({ ...newVenue, description: e.target.value })}
              />
              <input
                placeholder="Акция / оффер"
                value={newVenue.deal}
                onChange={(e) => setNewVenue({ ...newVenue, deal: e.target.value })}
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Широта"
                value={newVenue.lat}
                onChange={(e) => setNewVenue({ ...newVenue, lat: Number(e.target.value) })}
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Долгота"
                value={newVenue.lng}
                onChange={(e) => setNewVenue({ ...newVenue, lng: Number(e.target.value) })}
              />
            </div>
            <div className="modal-actions">
              <button className="cta" onClick={addVenue}>
                Сохранить
              </button>
              <button className="ghost" onClick={() => setShowVenueModal(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductModal && (
        <div className="modal">
          <div className="modal-card">
            <h3>Добавить товар</h3>
            <div className="form-grid">
              <input
                placeholder="Название"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              />
              <input
                placeholder="Описание"
                value={newProduct.description}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, description: e.target.value })
                }
              />
              <input
                placeholder="Ссылка на фото"
                value={newProduct.image}
                onChange={(e) => setNewProduct({ ...newProduct, image: e.target.value })}
              />
              <input
                type="number"
                placeholder="Цена"
                value={newProduct.price}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, price: Number(e.target.value) })
                }
              />
              <select
                value={newProduct.venue_id}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, venue_id: Number(e.target.value) })
                }
              >
                <option value={0}>Выберите заведение</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="cta" onClick={createProduct} disabled={!venues.length}>
                Сохранить товар
              </button>
              <button className="ghost" onClick={() => setShowProductModal(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
  )
}

export default App
