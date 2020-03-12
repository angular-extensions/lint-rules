# @angular-extensions/lint-rules
[https://github.com/angular-extensions/lint-rules](https://github.com/angular-extensions/lint-rules)

[![npm version](https://img.shields.io/npm/v/@angular-extensions/lint-rules.svg?style=flat-square)](https://www.npmjs.com/package/@angular-extensions/lint-rules)
[![npm downloads total](https://img.shields.io/npm/dt/@angular-extensions/lint-rules.svg?style=flat-square)](https://www.npmjs.com/package/@angular-extensions/lint-rules)
[![npm downloads monthly](https://img.shields.io/npm/dm/@angular-extensions/lint-rules.svg?style=flat-square)](https://www.npmjs.com/package/@angular-extensions/lint-rules)
[![CircleCI](https://circleci.com/gh/angular-extensions/lint-rules.svg?style=svg)](https://circleci.com/gh/angular-extensions/lint-rules)

## Description
This repository offers some [tslint](https://github.com/palantir/tslint) rules useful for angular projects, see [Rules](#Rules).

## Installation / Usage
* Install the [@angular-extensions/lint-rules](https://www.npmjs.com/package/@angular-extensions/lint-rules) npm package:
  ```
  npm install @angular-extensions/lint-rules --save-dev
  ```
* Add `@angular-extensions/lint-rules` to the `extensions` list in your `tslint.json`:
  ```json
  {
    "extends": [
      "tslint:recommended",
      "@angular-extensions/lint-rules"
    ]
  }
  ```
* Lint your project with
  ```
  ng lint
  ```

## Rules
The package includes the following rules:

| Rule | Description | Details | Enabled by default? |
| --- | --- | --- | --- |
| `angular-call-super-lifecycle-method-in-extended-class` | Enforces the application to call parent lifecycle function e.g. `super.ngOnDestroy()` when using inheritance within an Angular component or directive. | [Details](#angular-call-super-lifecycle-method-in-extended-class) | yes |
| `angular-rxjs-takeuntil-before-subscribe` | Enforces the application of the `takeUntil` operator when calling of `subscribe` within an Angular component or directive. | [Details](#angular-rxjs-takeuntil-before-subscribe) | yes |

### angular-call-super-lifecycle-method-in-extended-class
This rule tries to avoid memory leaks and other problems in angular components and directives by ensuring that 
a [life-cycle method](https://angular.io/guide/lifecycle-hooks), e.g. `ngOnDestroy(){}`, overriding its parent implementation 
must call the parent implementation with `super.ngOnDestroy()`.

#### Example
This should trigger an error:
```typescript
class MyClass {
    ngOnDestroy() {
        const a = 5;
    }
}
@Component({
  selector: 'app-my'
})
class MyComponent2 extends MyClass {

    ngOnDestroy() {
    ~~~~~~~~~~~            call to super.ngOnDestroy() is missing
        const b = 6;
    }
}
```
while this should be fine:
```typescript
class MyClass {
    ngOnDestroy() {
        const a = 5;
    }
}
@Component({
  selector: 'app-my'
})
class MyComponent extends MyClass {

    ngOnDestroy() {
        super.ngOnDestroy();
        const b = 6;
    }
}

@Component({
  selector: 'app-my2'
})
class MyComponent2 {
    ngOnDestroy() {
        const b = 6;
    }
}
```


### angular-rxjs-takeuntil-before-subscribe

This rule tries to avoid memory leaks in angular components and directives when calling `.subscribe()` without properly unsubscribing 
by enforcing the application of the `takeUntil(this.destroy$)` operator before the `.subscribe()` 
as well as before certain operators (`shareReplay` without `refCount: true`)
and ensuring the component implements the `ngOnDestroy` 
method invoking `this.destroy$.next()`.
All classes with a `@Component` or `@Directive` decorator and all their parent classes will be checked.

#### Example
This should trigger an error:
```typescript
@Component({
  selector: 'app-my',
  template: '<div>{{k$ | async}}</div>'
})
class MyComponent {
      ~~~~~~~~~~~    component containing subscribe must implement the ngOnDestroy() method

    
    k$ = a.pipe(shareReplay(1));
                ~~~~~~~~~~~~~~   the shareReplay operator used within a component must be preceded by takeUntil

    someMethod() {
        const e = a.pipe(switchMap(_ => b)).subscribe();
                                            ~~~~~~~~~      subscribe within a component must be preceded by takeUntil
    }
}
```

while this should be fine:
```typescript
@Component({
  selector: 'app-my',
  template: '<div>{{k$ | async}}</div>'
})
class MyComponent implements SomeInterface, OnDestroy {
    private destroy$: Subject<void> = new Subject<void>();

    k$ = a.pipe(takeUntil(this.destroy$), shareReplay(1));

    someMethod() {
        const e = a.pipe(switchMap(_ => b), takeUntil(this.destroy$)).subscribe();
    }

    ngOnDestroy() {
      this.destroy$.next();
    }
}
```


## Further reading
* https://slides.com/estebangehring/angular-app-memory-leak
* https://blog.angularindepth.com/the-best-way-to-unsubscribe-rxjs-observable-in-the-angular-applications-d8f9aa42f6a0
* https://github.com/cartant/rxjs-tslint-rules/pull/107

## Contributors
* Esteban Gehring ([@macjohnny](https://github.com/macjohnny))
* Lutz Bliska ([@lbliska](https://github.com/lbliska))

Note: this project is based on work in https://github.com/cartant/rxjs-tslint-rules/pull/107

## Development
Clone the repository and install the dependencies with `npm install`.

Note: using the build artifacts with `npm link` does not work correctly, 
since there will be a mismatch between the typescript version used by the consumer code 
and the typescript version used by the lint rules code. 
To test the package in a project, run 
```
npm run build
cd dist
npm install --production
``` 
Then copy the content of the `/dist` folder (including the `node_modules` folder) into `node_modules/@angular-extensions/lint-rules` 
in the consumer project.

### Publish
To publish the package, run
```
npm run publish-package
```
