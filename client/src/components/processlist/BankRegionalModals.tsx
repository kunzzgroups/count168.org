import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchBankCountryDropdown,
  fetchBanksByCountryApi,
  postAddCompanyCountry,
  postSaveCountryBanksList,
  postSaveSelectedBanksMap,
  postSaveSelectedCountries,
} from '../../lib/processListApi'

type CountryModalProps = {
  open: boolean
  companyId: number
  initialSelected: string[]
  onClose: () => void
  onSaved: (countries: string[]) => void
  onNotice: (msg: string, kind: 'ok' | 'err') => void
}

export function BankCountrySelectionModal({
  open,
  companyId,
  initialSelected,
  onClose,
  onSaved,
  onNotice,
}: CountryModalProps) {
  const [pool, setPool] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [newCountry, setNewCountry] = useState('')

  useEffect(() => {
    if (!open) return
    let alive = true
    void (async () => {
      const r = await fetchBankCountryDropdown(companyId)
      if (!alive) return
      if (r.success) {
        const list = [...new Set(r.data.map((x) => String(x).trim()).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b),
        )
        setPool(list)
      } else setPool([])
      setSelected([...initialSelected])
      setSearch('')
      setNewCountry('')
    })()
    return () => {
      alive = false
    }
  }, [open, companyId, initialSelected])

  const available = useMemo(() => {
    const sel = new Set(selected.map((s) => s.trim()).filter(Boolean))
    const q = search.trim().toUpperCase()
    return pool.filter((c) => !sel.has(c) && (!q || c.toUpperCase().includes(q)))
  }, [pool, selected, search])

  const moveToSelected = (name: string) => {
    const n = name.trim()
    if (!n || selected.includes(n)) return
    setSelected((s) => [...s, n])
  }

  const removeSelected = (name: string) => {
    setSelected((s) => s.filter((x) => x !== name))
  }

  const addNewCountry = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = newCountry.trim().toUpperCase()
    if (!n) return
    const r = await postAddCompanyCountry(companyId, n)
    if (!r.success) {
      onNotice(r.error, 'err')
      return
    }
    setPool((p) => [...new Set([...p, n])].sort((a, b) => a.localeCompare(b)))
    moveToSelected(n)
    setNewCountry('')
    onNotice('Country added', 'ok')
  }

  const confirm = async () => {
    const list = selected.map((x) => x.trim()).filter(Boolean)
    const r = await postSaveSelectedCountries(companyId, list)
    if (!r.success) {
      onNotice(r.error, 'err')
      return
    }
    onSaved(list)
    onClose()
  }

  if (!open) return null

  return (
    <div id="countrySelectionModal" className="modal" style={{ display: 'block' }} role="dialog" aria-modal>
      <div className="modal-content country-selection-modal">
        <div className="modal-header">
          <h2>Select or Add Country</h2>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="country-selection-container">
            <div className="available-countries-section">
              <div className="add-country-bar">
                <h3>Add New Country</h3>
                <form className="add-country-form" onSubmit={addNewCountry}>
                  <div className="add-country-input-group">
                    <input
                      type="text"
                      placeholder="Enter new country name..."
                      value={newCountry}
                      onChange={(e) => setNewCountry(e.target.value.toUpperCase())}
                    />
                    <button type="submit" className="btn btn-save">
                      Add
                    </button>
                  </div>
                </form>
              </div>
              <h3>Available Countries</h3>
              <div className="country-search">
                <input
                  type="text"
                  placeholder="Search countries..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value.toUpperCase())}
                />
              </div>
              <div className="country-list" id="existingCountries">
                {available.map((name) => (
                  <div key={name} className="country-item">
                    <div className="country-item-left">
                      <input
                        type="checkbox"
                        id={`country_pick_${name}`}
                        onChange={(e) => {
                          if (e.target.checked) moveToSelected(name)
                        }}
                      />
                      <label htmlFor={`country_pick_${name}`}>{name}</label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="selected-countries-section">
              <h3>Selected Countries</h3>
              <div className="selected-countries-list" id="selectedCountriesInModal">
                {selected.length === 0 ? (
                  <div className="no-countries">
                    <p>No countries selected</p>
                  </div>
                ) : (
                  selected.map((name) => (
                    <div key={name} className="selected-country-modal-item">
                      <span>{name}</span>
                      <button type="button" className="remove-country-modal" onClick={() => removeSelected(name)}>
                        &times;
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-save" id="confirmCountriesBtn" onClick={() => void confirm()}>
              Confirm
            </button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

type BankModalProps = {
  open: boolean
  companyId: number
  country: string
  initialSelectedBanks: string[]
  onClose: () => void
  onSaved: (nextMap: Record<string, string[]>) => void
  fullSelectedBanksMap: Record<string, string[]>
  onNotice: (msg: string, kind: 'ok' | 'err') => void
}

export function BankListSelectionModal({
  open,
  companyId,
  country,
  initialSelectedBanks,
  onClose,
  onSaved,
  fullSelectedBanksMap,
  onNotice,
}: BankModalProps) {
  const [pool, setPool] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [newBank, setNewBank] = useState('')

  const reloadPool = useCallback(async () => {
    const c = country.trim()
    if (!c) {
      setPool([])
      return
    }
    const r = await fetchBanksByCountryApi(companyId, c)
    if (r.success) {
      const raw = r.data.map((x) => String(x).trim()).filter(Boolean)
      setPool([...new Set(raw)].sort((a, b) => a.localeCompare(b)))
    } else setPool([])
  }, [companyId, country])

  useEffect(() => {
    if (!open) return
    void reloadPool()
    setSelected([...initialSelectedBanks])
    setSearch('')
    setNewBank('')
  }, [open, initialSelectedBanks, reloadPool])

  const available = useMemo(() => {
    const sel = new Set(selected.map((s) => s.trim()).filter(Boolean))
    const q = search.trim().toUpperCase()
    return pool.filter((b) => !sel.has(b) && (!q || b.toUpperCase().includes(q)))
  }, [pool, selected, search])

  const moveToSelected = (name: string) => {
    const n = name.trim()
    if (!n || selected.includes(n)) return
    setSelected((s) => [...s, n])
  }

  const removeSelected = (name: string) => {
    setSelected((s) => s.filter((x) => x !== name))
  }

  const addNewBank = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = newBank.trim().toUpperCase()
    if (!n || !country.trim()) return
    const r = await postSaveCountryBanksList(companyId, country, [n])
    if (!r.success) {
      onNotice(r.error, 'err')
      return
    }
    setPool((p) => [...new Set([...p, n])].sort((a, b) => a.localeCompare(b)))
    moveToSelected(n)
    setNewBank('')
    onNotice('Bank added', 'ok')
  }

  const confirm = async () => {
    const c = country.trim()
    if (!c) {
      onClose()
      return
    }
    const selectedList = selected.map((x) => x.trim()).filter(Boolean)
    const union = [...new Set([...selectedList, ...pool])]
    const r1 = await postSaveCountryBanksList(companyId, c, union)
    if (!r1.success) onNotice(r1.error, 'err')

    const nextMap: Record<string, string[]> = { ...fullSelectedBanksMap, [c]: selectedList }
    const r2 = await postSaveSelectedBanksMap(companyId, nextMap)
    if (!r2.success) {
      onNotice(r2.error, 'err')
      return
    }
    onSaved(nextMap)
    onClose()
  }

  if (!open) return null

  return (
    <div id="bankSelectionModal" className="modal" style={{ display: 'block' }} role="dialog" aria-modal>
      <div className="modal-content bank-selection-modal">
        <div className="modal-header">
          <h2>Select or Add Bank</h2>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="bank-selection-container">
            <div className="available-banks-section">
              <div className="add-bank-bar">
                <h3>Add New Bank</h3>
                <form className="add-bank-form" onSubmit={addNewBank}>
                  <div className="add-bank-input-group">
                    <input
                      type="text"
                      placeholder="Enter new bank name..."
                      value={newBank}
                      onChange={(e) => setNewBank(e.target.value.toUpperCase())}
                    />
                    <button type="submit" className="btn btn-save">
                      Add
                    </button>
                  </div>
                </form>
              </div>
              <h3>Available Banks</h3>
              <div className="bank-search">
                <input
                  type="text"
                  placeholder="Search banks..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value.toUpperCase())}
                />
              </div>
              <div className="bank-list" id="existingBanks">
                {available.map((name) => (
                  <div key={name} className="bank-item">
                    <div className="bank-item-left">
                      <input
                        type="checkbox"
                        id={`bank_pick_${name}`}
                        onChange={(e) => {
                          if (e.target.checked) moveToSelected(name)
                        }}
                      />
                      <label htmlFor={`bank_pick_${name}`}>{name}</label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="selected-banks-section">
              <h3>Selected Banks</h3>
              <div className="selected-banks-list" id="selectedBanksInModal">
                {selected.length === 0 ? (
                  <div className="no-countries">
                    <p>No banks selected</p>
                  </div>
                ) : (
                  selected.map((name) => (
                    <div key={name} className="selected-bank-modal-item">
                      <span>{name}</span>
                      <button type="button" className="remove-bank-modal" onClick={() => removeSelected(name)}>
                        &times;
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-save" id="confirmBanksBtn" onClick={() => void confirm()}>
              Confirm
            </button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
