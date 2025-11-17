import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Shield, Zap } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'

export function LoginPage() {
  const { login, isAuthenticating } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      setError(null)
      await login(form.email, form.password)
      const redirectTo = location.state?.from?.pathname || '/'
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message || 'Unable to sign in')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/80 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-2xl">GridOne Operator Console</CardTitle>
            <CardDescription>Sign in to access the smart home dashboard.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="operator@agrid.com" value={form.email} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" placeholder="••••••••" value={form.password} onChange={handleChange} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isAuthenticating}>
              {isAuthenticating ? 'Signing in...' : 'Login'}
            </Button>
            <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" /> Auth state stored in-memory for optimal security.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
