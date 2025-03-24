'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
// import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Moon, Sun, AlertCircle, Globe, Bell, Monitor, Trash2, Info, DollarSign, PlusCircle, X, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useTheme } from '@/providers/ThemeProvider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function SettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [language, setLanguage] = useState('fr');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  // États pour les taux de conversion
  const [currencies, setCurrencies] = useState([
    { code: 'FCFA', name: 'Franc CFA', rate: 1, isDefault: true, isBaseCurrency: true },
    { code: 'EUR', name: 'Euro', rate: 655.957, isDefault: false },
    { code: 'USD', name: 'Dollar américain', rate: 603.50, isDefault: false },
    { code: 'GBP', name: 'Livre sterling', rate: 767.55, isDefault: false },
  ]);
  const [newCurrency, setNewCurrency] = useState({ code: '', name: '', rate: '' });
  const [editingCurrency, setEditingCurrency] = useState<string | null>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  // Rediriger vers la page de connexion si l'utilisateur n'est pas connecté
  if (!session) {
    router.push('/auth/signin');
    return null;
  }

  // Charger les taux de change par défaut
  useEffect(() => {
    const fetchExchangeRates = async () => {
      try {
        setIsLoadingRates(true);
        const response = await fetch('/api/exchange-rates/default');
        if (!response.ok) throw new Error('Erreur lors de la récupération des taux de change');
        
        const data = await response.json();
        
        // Conversion des taux en objets pour notre interface
        if (data && data.rates) {
          const newCurrencies = [
            { code: 'FCFA', name: 'Franc CFA', rate: 1, isDefault: true, isBaseCurrency: true },
          ];
          
          if (data.rates.EUR) {
            newCurrencies.push({ 
              code: 'EUR', 
              name: 'Euro', 
              rate: data.rates.EUR, 
              isDefault: false,
              isBaseCurrency: false
            });
          }
          
          if (data.rates.USD) {
            newCurrencies.push({ 
              code: 'USD', 
              name: 'Dollar américain', 
              rate: data.rates.USD, 
              isDefault: false,
              isBaseCurrency: false
            });
          }
          
          if (data.rates.GBP) {
            newCurrencies.push({ 
              code: 'GBP', 
              name: 'Livre sterling', 
              rate: data.rates.GBP, 
              isDefault: false,
              isBaseCurrency: false
            });
          }
          
          setCurrencies(newCurrencies);
        }
      } catch (error) {
        console.error('Erreur:', error);
        setError('Impossible de charger les taux de change');
      } finally {
        setIsLoadingRates(false);
      }
    };

    if (session) {
      fetchExchangeRates();
    }
  }, [session]);

  const handleSaveSettings = () => {
    setLoading(true);
    setError('');
    setSuccess('');

    // Simuler un délai d'enregistrement
    setTimeout(() => {
      setSuccess('Paramètres enregistrés avec succès');
      setLoading(false);
    }, 1000);
  };

  const handleDeleteAccount = async () => {
    if (confirmDeleteAccount !== session.user.email) {
      setError('Veuillez confirmer votre email pour supprimer votre compte');
      return;
    }

    setIsDeleting(true);
    setError('');

    try {
      const response = await fetch('/api/users/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Une erreur est survenue');
      }

      // Déconnexion après suppression
      await signOut({ callbackUrl: '/' });
    } catch (error: any) {
      setError(error.message || 'Une erreur est survenue lors de la suppression');
      setIsDeleting(false);
    }
  };
  
  // Ajouter une nouvelle devise
  const handleAddCurrency = () => {
    if (!newCurrency.code || !newCurrency.name || !newCurrency.rate) {
      setError('Tous les champs sont requis pour ajouter une devise');
      return;
    }
    
    const rate = parseFloat(newCurrency.rate);
    if (isNaN(rate) || rate <= 0) {
      setError('Le taux de conversion doit être un nombre positif');
      return;
    }
    
    if (currencies.some(c => c.code === newCurrency.code)) {
      setError('Cette devise existe déjà');
      return;
    }
    
    setCurrencies([...currencies, { 
      code: newCurrency.code, 
      name: newCurrency.name, 
      rate: parseFloat(newCurrency.rate),
      isDefault: false,
      isBaseCurrency: false
    }]);
    setNewCurrency({ code: '', name: '', rate: '' });
    setSuccess('Devise ajoutée avec succès');
  };
  
  // Supprimer une devise
  const handleDeleteCurrency = (code: string) => {
    // Empêcher la suppression de la devise de base (FCFA)
    const currencyToDelete = currencies.find(c => c.code === code);
    if (currencyToDelete?.isBaseCurrency) {
      setError('Impossible de supprimer la devise de base FCFA');
      return;
    }
    
    setCurrencies(currencies.filter(c => c.code !== code));
    setSuccess('Devise supprimée avec succès');
  };
  
  // Mettre à jour le taux d'une devise
  const handleUpdateCurrencyRate = (code: string, newRate: string) => {
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate <= 0) {
      setError('Le taux de conversion doit être un nombre positif');
      return;
    }
    
    setCurrencies(currencies.map(c => 
      c.code === code ? { ...c, rate } : c
    ));
    setEditingCurrency(null);
    setSuccess('Taux de conversion mis à jour');
  };
  
  // Définir comme devise par défaut
  const handleSetDefaultCurrency = (code: string) => {
    setCurrencies(currencies.map(c => ({
      ...c,
      isDefault: c.code === code
    })));
    setSuccess(`${code} définie comme devise par défaut`);
  };
  
  // Réinitialiser les taux de change
  const handleResetRates = () => {
    setCurrencies([
      { code: 'FCFA', name: 'Franc CFA', rate: 1, isDefault: true, isBaseCurrency: true },
      { code: 'EUR', name: 'Euro', rate: 655.957, isDefault: false },
      { code: 'USD', name: 'Dollar américain', rate: 603.50, isDefault: false },
      { code: 'GBP', name: 'Livre sterling', rate: 767.55, isDefault: false },
    ]);
    setSuccess('Taux de change réinitialisés');
  };

  // Fonction pour sauvegarder tous les taux de change
  const handleSaveExchangeRates = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Préparer les données pour l'API
      const ratesToSave = currencies
        .filter(c => !c.isBaseCurrency) // Ne pas envoyer la devise de base (FCFA)
        .map(c => ({
          sourceCurrency: c.code,
          targetCurrency: 'FCFA',
          rate: c.rate
        }));
      
      // Appel à l'API
      const response = await fetch('/api/exchange-rates', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rates: ratesToSave,
          date: new Date()
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la sauvegarde des taux');
      }
      
      setSuccess('Taux de change enregistrés avec succès');
    } catch (error: any) {
      console.error('Erreur:', error);
      setError(error.message || 'Erreur lors de la sauvegarde des taux');
    } finally {
      setLoading(false);
    }
  };

  // Animations (commentées car framer-motion n'est pas disponible)
  /*
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 100,
      },
    },
  };
  */

  return (
    <div
      className="flex-1 p-6 md:p-8"
      // Retirer les animations pour le moment
      // initial="hidden"
      // animate="visible"
      // variants={containerVariants}
    >
      <div
        // variants={itemVariants}
      >
        <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
          <SettingsIcon className="h-8 w-8" />
          Paramètres
        </h1>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-500 text-green-700">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="appearance" className="w-full max-w-3xl">
          <TabsList className="mb-6">
            <TabsTrigger value="appearance">Apparence</TabsTrigger>
            <TabsTrigger value="language">Langue</TabsTrigger>
            <TabsTrigger value="currencies">Devises</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="account">Compte</TabsTrigger>
          </TabsList>

          <TabsContent value="appearance">
            <Card>
              <CardHeader>
                <CardTitle>Apparence</CardTitle>
                <CardDescription>
                  Personnalisez l'apparence de l'application
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="theme">Thème</Label>
                  <RadioGroup
                    id="theme"
                    value={theme}
                    onValueChange={(value: 'light' | 'dark' | 'system') => setTheme(value)}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="light" id="theme-light" />
                      <Label htmlFor="theme-light" className="flex items-center gap-2">
                        <Sun className="h-4 w-4" />
                        Clair
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="dark" id="theme-dark" />
                      <Label htmlFor="theme-dark" className="flex items-center gap-2">
                        <Moon className="h-4 w-4" />
                        Sombre
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="system" id="theme-system" />
                      <Label htmlFor="theme-system" className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        Système
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="reduced-animations">Réduire les animations</Label>
                    <p className="text-sm text-muted-foreground">
                      Désactiver les animations pour améliorer les performances
                    </p>
                  </div>
                  <Switch id="reduced-animations" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="language">
            <Card>
              <CardHeader>
                <CardTitle>Langue</CardTitle>
                <CardDescription>
                  Définissez vos préférences linguistiques
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="language">Langue de l'application</Label>
                  <RadioGroup
                    id="language"
                    value={language}
                    onValueChange={setLanguage}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="fr" id="lang-fr" />
                      <Label htmlFor="lang-fr" className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Français
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="en" id="lang-en" />
                      <Label htmlFor="lang-en" className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Anglais
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                
                <p className="text-sm text-muted-foreground italic">
                  D'autres langues seront disponibles prochainement.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="currencies">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Gestion des devises
                </CardTitle>
                <CardDescription>
                  Configurez les taux de conversion et les devises disponibles dans l'application
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="mb-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">Devises disponibles</h3>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleResetRates}
                      className="flex items-center gap-1"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Réinitialiser
                    </Button>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-4">
                    Le FCFA est la devise de base et ne peut pas être supprimée. 
                    Tous les taux sont exprimés par rapport au FCFA.
                  </p>
                  
                  {isLoadingRates ? (
                    <div className="flex justify-center py-4">
                      <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Devise</TableHead>
                          <TableHead>Taux (1 unité = X FCFA)</TableHead>
                          <TableHead>Par défaut</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currencies.map(currency => (
                          <TableRow key={currency.code}>
                            <TableCell>
                              <Badge variant="outline">{currency.code}</Badge>
                            </TableCell>
                            <TableCell>{currency.name}</TableCell>
                            <TableCell>
                              {editingCurrency === currency.code ? (
                                <div className="flex items-center gap-2">
                                  <Input 
                                    type="number" 
                                    min="0.01" 
                                    step="0.01"
                                    defaultValue={currency.rate.toString()}
                                    className="w-28"
                                    onChange={(e) => {
                                      // La mise à jour est effectuée lors de la validation
                                    }}
                                    onBlur={(e) => handleUpdateCurrencyRate(currency.code, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleUpdateCurrencyRate(currency.code, e.currentTarget.value);
                                      } else if (e.key === 'Escape') {
                                        setEditingCurrency(null);
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => setEditingCurrency(null)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div 
                                  className="cursor-pointer hover:underline"
                                  onClick={() => !currency.isBaseCurrency && setEditingCurrency(currency.code)}
                                >
                                  {currency.rate.toFixed(3)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {currency.isDefault ? (
                                <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Par défaut</Badge>
                              ) : (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleSetDefaultCurrency(currency.code)}
                                >
                                  Définir par défaut
                                </Button>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {!currency.isBaseCurrency && (
                                <Button 
                                  variant="destructive" 
                                  size="icon"
                                  onClick={() => handleDeleteCurrency(currency.code)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Ajouter une nouvelle devise</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currency-code">Code</Label>
                      <Input 
                        id="currency-code" 
                        placeholder="USD" 
                        maxLength={4}
                        value={newCurrency.code}
                        onChange={(e) => setNewCurrency({...newCurrency, code: e.target.value.toUpperCase()})}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="currency-name">Nom</Label>
                      <Input 
                        id="currency-name" 
                        placeholder="Dollar américain"
                        value={newCurrency.name}
                        onChange={(e) => setNewCurrency({...newCurrency, name: e.target.value})}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="currency-rate">Taux (1 unité = X FCFA)</Label>
                      <Input 
                        id="currency-rate" 
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="655.957"
                        value={newCurrency.rate}
                        onChange={(e) => setNewCurrency({...newCurrency, rate: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <Button 
                    onClick={handleAddCurrency}
                    className="flex items-center gap-2"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Ajouter la devise
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                  Gérez vos préférences de notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-notifications">Notifications par e-mail</Label>
                    <p className="text-sm text-muted-foreground">
                      Recevoir des notifications importantes par e-mail
                    </p>
                  </div>
                  <Switch 
                    id="email-notifications" 
                    checked={emailNotifications} 
                    onCheckedChange={setEmailNotifications}
                  />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="project-notifications">Notifications de projets</Label>
                    <p className="text-sm text-muted-foreground">
                      Recevoir des notifications pour les mises à jour de projets
                    </p>
                  </div>
                  <Switch id="project-notifications" defaultChecked />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="security-notifications">Notifications de sécurité</Label>
                    <p className="text-sm text-muted-foreground">
                      Recevoir des alertes concernant la sécurité de votre compte
                    </p>
                  </div>
                  <Switch id="security-notifications" defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>Gestion du compte</CardTitle>
                <CardDescription>
                  Gérez les paramètres de votre compte
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={session.user.email || ''} disabled />
                  <p className="text-xs text-muted-foreground mt-1">
                    L'adresse email ne peut pas être modifiée pour des raisons de sécurité.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col items-start">
                <div className="w-full border border-destructive p-4 rounded-md bg-destructive/5">
                  <div className="flex flex-col space-y-2">
                    <h4 className="text-lg font-medium text-destructive flex items-center gap-2">
                      <Trash2 className="h-5 w-5" />
                      Zone dangereuse
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Une fois votre compte supprimé, toutes vos données seront définitivement effacées. Cette action est irréversible.
                    </p>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="mt-2 w-full md:w-auto">
                          Supprimer mon compte
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Êtes-vous absolument sûr?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cette action ne peut pas être annulée. Votre compte sera définitivement supprimé et toutes vos données seront effacées de nos serveurs.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="space-y-2 py-2">
                          <Label htmlFor="confirm-email" className="text-destructive font-medium">
                            Saisissez votre email pour confirmer
                          </Label>
                          <Input 
                            id="confirm-email" 
                            value={confirmDeleteAccount}
                            onChange={(e) => setConfirmDeleteAccount(e.target.value)}
                            placeholder={session.user.email || ''}
                            className="border-destructive focus-visible:ring-destructive"
                          />
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setConfirmDeleteAccount('')}>
                            Annuler
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDeleteAccount}
                            disabled={isDeleting || confirmDeleteAccount !== session.user.email}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            {isDeleting ? (
                              <>
                                <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-background border-t-transparent"></span>
                                Suppression...
                              </>
                            ) : (
                              "Supprimer définitivement"
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex justify-end">
          <Button
            onClick={handleSaveExchangeRates}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                Enregistrement...
              </span>
            ) : (
              'Enregistrer les modifications'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
} 